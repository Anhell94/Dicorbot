const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');

// Configuración - USARÁ VARIABLES DE ENTORNO
const CONFIG = {
  ROLES: {
    INICIADO: process.env.ROL_INICIADO || '1418438738685595768',
    ORO: process.env.ROL_ORO || '1418452307405963445', 
    PLATINO: process.env.ROL_PLATINO || '1418452624549875783'
  },
  CHANNELS: {
    RECOMPENSAS: process.env.CHANNEL_RECOMPENSAS || '1418453783767158864'
  },
  INVITACIONES: {
    ORO: parseInt(process.env.INVITACIONES_ORO) || 5,
    PLATINO: parseInt(process.env.INVITACIONES_PLATINO) || 10
  }
};

// Servidor web para Render health checks
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    message: '🤖 Bot activo y funcionando correctamente',
    timestamp: new Date().toISOString(),
    service: 'Render.com'
  });
});

// Health check endpoint para Render
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    bot: client.user ? client.user.tag : 'connecting...',
    timestamp: new Date().toISOString(),
    invitesTracked: userInvites.size,
    uptime: process.uptime()
  });
});

// Cliente de Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Variables globales
const invitesCache = new Map();
const userInvites = new Map();

// EVENTOS PRINCIPALES
client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} conectado correctamente!`);
  console.log(`🏠 Servidor: ${client.guilds.cache.first()?.name || 'No encontrado'}`);
  console.log('📋 Configuración cargada:', CONFIG);
  await loadInvites();
});

client.on('guildMemberAdd', async (member) => {
  console.log(`👤 Nuevo miembro: ${member.user.tag}`);
  await assignStarterRole(member);
  await trackInvite(member);
});

// FUNCIONES
async function loadInvites() {
  for (const guild of client.guilds.cache.values()) {
    try {
      const invites = await guild.invites.fetch();
      invitesCache.set(guild.id, invites);
      console.log(`📋 Cargadas ${invites.size} invitaciones para: ${guild.name}`);
    } catch (error) {
      console.error('❌ Error cargando invitaciones:', error.message);
    }
  }
}

async function assignStarterRole(member) {
  try {
    const role = member.guild.roles.cache.get(CONFIG.ROLES.INICIADO);
    if (role) {
      await member.roles.add(role);
      console.log(`🎯 Rol "iniciado" asignado a ${member.user.tag}`);
      
      // Mensaje de bienvenida
      try {
        await member.send(`¡Bienvenido al servidor! 🎉 Se te ha asignado el rol **Iniciado**. Invita a tus amigos para obtener mejores roles y recompensas.`);
      } catch (dmError) {
        console.log('⚠️ No se pudo enviar DM al nuevo miembro');
      }
    } else {
      console.log('❌ Rol "iniciado" no encontrado');
    }
  } catch (error) {
    console.error('❌ Error asignando rol:', error.message);
  }
}

async function trackInvite(member) {
  try {
    const newInvites = await member.guild.invites.fetch();
    const oldInvites = invitesCache.get(member.guild.id) || new Map();

    let inviter = null;
    let usedInvite = null;

    // Buscar qué invitación fue usada
    for (const [code, oldInvite] of oldInvites) {
      const newInvite = newInvites.get(code);
      if (newInvite && newInvite.uses > oldInvite.uses) {
        inviter = oldInvite.inviter;
        usedInvite = newInvite;
        console.log(`📨 ${member.user.tag} fue invitado por ${inviter?.tag || 'desconocido'} usando código: ${code}`);
        break;
      }
    }

    if (inviter) {
      await updateInviterCount(inviter.id, member.guild.id);
    }

    // Actualizar cache
    invitesCache.set(member.guild.id, newInvites);

  } catch (error) {
    console.error('❌ Error trackeando invitación:', error.message);
  }
}

async function updateInviterCount(userId, guildId) {
  try {
    const key = `${userId}-${guildId}`;
    const currentCount = (userInvites.get(key) || 0) + 1;
    userInvites.set(key, currentCount);
    
    console.log(`📊 Usuario ${userId} ahora tiene ${currentCount} invitaciones`);
    
    await checkRankUp(userId, guildId, currentCount);
  } catch (error) {
    console.error('❌ Error actualizando contador:', error.message);
  }
}

async function checkRankUp(userId, guildId, inviteCount) {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;

    const oroRole = guild.roles.cache.get(CONFIG.ROLES.ORO);
    const platinoRole = guild.roles.cache.get(CONFIG.ROLES.PLATINO);

    // Verificar roles actuales
    const hasOro = member.roles.cache.has(CONFIG.ROLES.ORO);
    const hasPlatino = member.roles.cache.has(CONFIG.ROLES.PLATINO);

    let newRole = null;
    let oldRole = null;

    // Lógica de asignación de roles
    if (inviteCount >= CONFIG.INVITACIONES.PLATINO && platinoRole && !hasPlatino) {
      if (oroRole && hasOro) {
        await member.roles.remove(oroRole);
        oldRole = 'Oro';
      }
      await member.roles.add(platinoRole);
      newRole = 'Platino';
      console.log(`🏆 Rol Platino asignado a ${member.user.tag}`);

    } else if (inviteCount >= CONFIG.INVITACIONES.ORO && oroRole && !hasOro && !hasPlatino) {
      await member.roles.add(oroRole);
      newRole = 'Oro';
      console.log(`🥇 Rol Oro asignado a ${member.user.tag}`);
    }

    // Enviar anuncio si hubo ascenso
    if (newRole) {
      await sendAnnouncement(member, newRole, oldRole, inviteCount);
    }

  } catch (error) {
    console.error('❌ Error en checkRankUp:', error.message);
  }
}

async function sendAnnouncement(member, newRank, oldRank, count) {
  try {
    const channel = client.channels.cache.get(CONFIG.CHANNELS.RECOMPENSAS);
    if (!channel) {
      console.log('❌ Canal de recompensas no encontrado');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('🎉 ¡Ascenso de Rango! 🎉')
      .setDescription(`**${member.user}** ha sido ascendido`)
      .addFields(
        { name: '📊 Invitaciones', value: `${count} invitaciones`, inline: true },
        { name: '🏆 Nuevo Rango', value: newRank, inline: true },
        { name: '⭐ Rango Anterior', value: oldRank || 'Ninguno', inline: true }
      )
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setTimestamp()
      .setFooter({ text: 'Sistema de Recompensas por Invitaciones' });

    await channel.send({ 
      content: `🎉 ¡Felicidades ${member.user}! 🎉`,
      embeds: [embed] 
    });

    console.log(`📢 Anuncio de ascenso enviado para ${member.user.tag}`);

  } catch (error) {
    console.error('❌ Error enviando anuncio:', error.message);
  }
}

// Comandos del bot
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content === '!invites') {
    const key = `${message.author.id}-${message.guild.id}`;
    const count = userInvites.get(key) || 0;
    
    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('📊 Tus Invitaciones')
      .setDescription(`**${message.author.username}**, tienes **${count}** invitaciones`)
      .addFields(
        { name: '🥇 Rol Oro', value: `Se requiere: ${CONFIG.INVITACIONES.ORO} invitaciones`, inline: true },
        { name: '🏆 Rol Platino', value: `Se requiere: ${CONFIG.INVITACIONES.PLATINO} invitaciones`, inline: true }
      )
      .setFooter({ text: 'Usa !help para más comandos' });

    message.reply({ embeds: [embed] });
  }

  if (message.content === '!help') {
    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('🤖 Comandos del Bot')
      .setDescription('Comandos disponibles:')
      .addFields(
        { name: '!invites', value: 'Muestra tus invitaciones actuales', inline: false },
        { name: '!help', value: 'Muestra esta ayuda', inline: false }
      )
      .setFooter({ text: 'Sistema de Invitaciones' });

    message.reply({ embeds: [embed] });
  }
});

// Manejo de errores
client.on('error', (error) => {
  console.error('❌ Error del cliente:', error.message);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error.message);
});

// INICIAR SERVICIOS
console.log('🚀 Iniciando servicios...');

// Iniciar servidor web
const server = app.listen(PORT, () => {
  console.log(`🌐 Servidor web iniciado en puerto ${PORT}`);
  console.log(`📊 Health check disponible en: http://localhost:${PORT}/health`);
});

// Iniciar bot de Discord
const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('❌ ERROR: No se encontró DISCORD_TOKEN en las variables de entorno');
  console.log('💡 Configura las variables de entorno en Render.com');
  process.exit(1);
}

client.login(TOKEN).catch(error => {
  console.error('❌ Error al iniciar sesión en Discord:', error.message);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Recibido SIGTERM, apagando...');
  client.destroy();
  server.close(() => {
    console.log('✅ Servidor apagado correctamente');
    process.exit(0);
  });
});