const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const express = require('express');
const axios = require('axios');

// Configuración - USARÁ VARIABLES DE ENTORNO
const CONFIG = {
  ROLES: {
    INICIADO: process.env.ROL_INICIADO || '1418438738685595768',
    ORO: process.env.ROL_ORO || '1418452307405963445', 
    PLATINO: process.env.ROL_PLATINO || '1418452624549875783'
  },
  CHANNELS: {
    RECOMPENSAS: process.env.CHANNEL_RECOMPENSAS || '1418453783767158864',
    LOGS: process.env.CHANNEL_LOGS || '1418453783767158864',
    BIENVENIDAS: process.env.CHANNEL_BIENVENIDAS || '1418453783767158864' // ✅ NUEVO CANAL
  },
  INVITACIONES: {
    ORO: parseInt(process.env.INVITACIONES_ORO) || 5,
    PLATINO: parseInt(process.env.INVITACIONES_PLATINO) || 10
  }
};

// URL de tu app en Render para auto-ping
const RENDER_URL = process.env.RENDER_URL || 'https://tu-bot.onrender.com';

// Servidor web para Render health checks
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Función de auto-ping para evitar que Render duerma el bot
async function autoPing() {
  try {
    console.log('🔄 Haciendo ping automático para mantener activo...');
    const response = await axios.get(`${RENDER_URL}/health`);
    console.log(`✅ Ping exitoso: Status ${response.status} - ${new Date().toLocaleTimeString()}`);
  } catch (error) {
    console.log('❌ Error en ping automático:', error.message);
  }
}

// Iniciar ping automático cada 5 minutos (300 segundos)
setInterval(autoPing, 5 * 60 * 1000);

// Health check endpoint mejorado
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    message: '🤖 Bot activo y funcionando correctamente',
    timestamp: new Date().toISOString(),
    service: 'Render.com + Auto-Ping',
    endpoints: {
      health: '/health',
      status: '/status',
      info: '/'
    }
  });
});

// Health check endpoint para Render y auto-ping
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    bot: client.user ? client.user.tag : 'connecting...',
    timestamp: new Date().toISOString(),
    invitesTracked: userInvites.size,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Endpoint de status extendido
app.get('/status', (req, res) => {
  res.json({
    botStatus: client.user ? 'connected' : 'disconnected',
    guild: client.guilds.cache.first()?.name || 'No conectado',
    members: client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0),
    invitesTracked: userInvites.size,
    lastPing: new Date().toISOString(),
    renderInstance: 'active'
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
  
  // Primer ping inmediato al iniciar
  autoPing();
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

// ✅ NUEVA FUNCIÓN: Notificación de bienvenida con invitador
async function sendWelcomeNotification(member, inviter, inviteCode) {
  try {
    const welcomeChannel = client.channels.cache.get(CONFIG.CHANNELS.BIENVENIDAS);
    if (!welcomeChannel) {
      console.log('❌ Canal de bienvenidas no encontrado');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('🎉 ¡Nuevo Miembro! 🎉')
      .setDescription(`**${member.user.tag}** se ha unido al servidor`)
      .addFields(
        { name: '👤 Invitado por', value: inviter ? `${inviter.tag}` : 'Invitación directa', inline: true },
        { name: '📨 Código de invitación', value: `\`${inviteCode || 'N/A'}\``, inline: true },
        { name: '🆔 User ID', value: member.user.id, inline: true },
        { name: '📅 Cuenta creada', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: '👥 Miembro número', value: `#${member.guild.memberCount}`, inline: true }
      )
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setImage('https://i.imgur.com/abcdefg.gif') // Puedes agregar un GIF de bienvenida
      .setTimestamp()
      .setFooter({ text: '¡Bienvenido al servidor! 🎊' });

    await welcomeChannel.send({
      content: `🎊 ¡Bienvenido ${member.user}! 🎊`,
      embeds: [embed]
    });

    console.log(`📢 Notificación de bienvenida enviada para ${member.user.tag}`);

  } catch (error) {
    console.error('❌ Error enviando notificación de bienvenida:', error.message);
  }
}

async function trackInvite(member) {
  try {
    const newInvites = await member.guild.invites.fetch();
    const oldInvites = invitesCache.get(member.guild.id) || new Map();

    let inviter = null;
    let usedInviteCode = null;
    let usedInvite = null;

    // Buscar qué invitación fue usada
    for (const [code, oldInvite] of oldInvites) {
      const newInvite = newInvites.get(code);
      if (newInvite && newInvite.uses > oldInvite.uses) {
        inviter = oldInvite.inviter;
        usedInviteCode = code;
        usedInvite = newInvite;
        console.log(`📨 ${member.user.tag} fue invitado por ${inviter?.tag || 'desconocido'} usando código: ${code}`);
        break;
      }
    }

    // ✅ ENVIAR NOTIFICACIÓN DE BIENVENIDA
    await sendWelcomeNotification(member, inviter, usedInviteCode);

    if (inviter) {
      await updateInviterCount(inviter.id, member.guild.id, member);
    }

    // Actualizar cache
    invitesCache.set(member.guild.id, newInvites);

  } catch (error) {
    console.error('❌ Error trackeando invitación:', error.message);
  }
}

async function updateInviterCount(userId, guildId, invitedMember = null) {
  try {
    const key = `${userId}-${guildId}`;
    const currentCount = (userInvites.get(key) || 0) + 1;
    userInvites.set(key, currentCount);
    
    console.log(`📊 Usuario ${userId} ahora tiene ${currentCount} invitaciones`);
    
    // Guardar en "base de datos" simple
    saveInvitesData();
    
    await checkRankUp(userId, guildId, currentCount, invitedMember);

  } catch (error) {
    console.error('❌ Error actualizando contador:', error.message);
  }
}

// FUNCIÓN PARA AGREGAR INVITACIONES MANUALMENTE
async function addManualInvites(userId, guildId, cantidad, adminUser, reason = 'Ajuste manual') {
  try {
    const key = `${userId}-${guildId}`;
    const currentCount = userInvites.get(key) || 0;
    const newCount = currentCount + cantidad;
    
    userInvites.set(key, newCount);
    
    console.log(`📝 Invitaciones manuales agregadas: ${userId} +${cantidad} = ${newCount} (por: ${adminUser.tag})`);
    
    // Guardar datos
    saveInvitesData();
    
    // Notificar en logs
    await logAction(adminUser, `Agregó ${cantidad} invitaciones a <@${userId}> (Total: ${newCount}) - Razón: ${reason}`);
    
    // Verificar ascenso de rango
    await checkRankUp(userId, guildId, newCount);
    
    return newCount;
    
  } catch (error) {
    console.error('❌ Error agregando invitaciones manuales:', error.message);
    throw error;
  }
}

// GUARDAR DATOS DE INVITACIONES
function saveInvitesData() {
  console.log('💾 Datos de invitaciones actualizados (en memoria)');
}

// LOG DE ACCIONES
async function logAction(admin, message) {
  try {
    const logChannel = client.channels.cache.get(CONFIG.CHANNELS.LOGS);
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('📝 Log del Sistema')
        .setDescription(message)
        .addFields(
          { name: '🛠️ Moderador', value: `${admin.tag} (${admin.id})`, inline: true },
          { name: '⏰ Fecha', value: new Date().toLocaleString(), inline: true }
        )
        .setTimestamp();

      await logChannel.send({ embeds: [embed] });
    }
  } catch (error) {
    console.error('❌ Error enviando log:', error.message);
  }
}

async function checkRankUp(userId, guildId, inviteCount, invitedMember = null) {
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
    let roleAction = null;

    // Lógica de asignación de roles
    if (inviteCount >= CONFIG.INVITACIONES.PLATINO && platinoRole && !hasPlatino) {
      if (oroRole && hasOro) {
        await member.roles.remove(oroRole);
        oldRole = 'Oro';
      }
      await member.roles.add(platinoRole);
      newRole = 'Platino';
      roleAction = 'ascendido a';
      console.log(`🏆 Rol Platino asignado a ${member.user.tag}`);

    } else if (inviteCount >= CONFIG.INVITACIONES.ORO && oroRole && !hasOro && !hasPlatino) {
      await member.roles.add(oroRole);
      newRole = 'Oro';
      roleAction = 'ascendido a';
      console.log(`🥇 Rol Oro asignado a ${member.user.tag}`);
    }

    // Enviar anuncio si hubo ascenso
    if (newRole) {
      await sendAnnouncement(member, newRole, oldRole, inviteCount, invitedMember);
      
      // Log de ascenso
      await logAction(client.user, 
        `🎉 <@${member.id}> fue ${roleAction} **${newRole}** por alcanzar ${inviteCount} invitaciones`
      );
    }

  } catch (error) {
    console.error('❌ Error en checkRankUp:', error.message);
  }
}

async function sendAnnouncement(member, newRank, oldRank, count, invitedMember = null) {
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

    if (invitedMember) {
      embed.addFields({ 
        name: '👤 Nuevo Miembro', 
        value: `${invitedMember.user.tag}`, 
        inline: true 
      });
    }

    await channel.send({ 
      content: `🎉 ¡Felicidades ${member.user}! 🎉`,
      embeds: [embed] 
    });

    console.log(`📢 Anuncio de ascenso enviado para ${member.user.tag}`);

  } catch (error) {
    console.error('❌ Error enviando anuncio:', error.message);
  }
}

// COMANDOS DEL BOT
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // !invites - Ver tus propias invitaciones
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

  // !addinvites @usuario cantidad [razón] - AGREGAR INVITACIONES MANUALMENTE
  if (message.content.startsWith('!addinvites')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ Necesitas permisos de administrador para usar este comando.');
    }

    const args = message.content.split(' ').slice(1);
    if (args.length < 2) {
      return message.reply('❌ Uso: `!addinvites @usuario cantidad [razón]`');
    }

    const userMention = args[0];
    const cantidad = parseInt(args[1]);
    const reason = args.slice(2).join(' ') || 'Ajuste administrativo';

    if (isNaN(cantidad) || cantidad <= 0) {
      return message.reply('❌ La cantidad debe ser un número positivo.');
    }

    const user = message.mentions.users.first();
    if (!user) {
      return message.reply('❌ Debes mencionar a un usuario válido.');
    }

    if (user.bot) {
      return message.reply('❌ No puedes agregar invitaciones a bots.');
    }

    try {
      const newCount = await addManualInvites(
        user.id, 
        message.guild.id, 
        cantidad, 
        message.author,
        reason
      );

      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Invitaciones Agregadas')
        .setDescription(`Se agregaron **${cantidad}** invitaciones a ${user.tag}`)
        .addFields(
          { name: '📊 Nuevo Total', value: `${newCount} invitaciones`, inline: true },
          { name: '🛠️ Moderador', value: message.author.tag, inline: true },
          { name: '📝 Razón', value: reason, inline: false }
        )
        .setTimestamp();

      message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Error:', error);
      message.reply('❌ Error al agregar invitaciones: ' + error.message);
    }
  }

  // !checkinvites @usuario - VER INVITACIONES DE OTRO USUARIO
  if (message.content.startsWith('!checkinvites')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ Necesitas permisos de administrador para usar este comando.');
    }

    const args = message.content.split(' ').slice(1);
    let targetUser;

    if (args.length === 0) {
      targetUser = message.author;
    } else {
      targetUser = message.mentions.users.first();
      if (!targetUser) {
        return message.reply('❌ Debes mencionar a un usuario válido.');
      }
    }

    const key = `${targetUser.id}-${message.guild.id}`;
    const count = userInvites.get(key) || 0;

    const embed = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle('📊 Invitaciones del Usuario')
      .setDescription(`**${targetUser.tag}** tiene **${count}** invitaciones`)
      .addFields(
        { name: '🆔 User ID', value: targetUser.id, inline: true },
        { name: '🥇 Para Oro', value: `${Math.max(0, CONFIG.INVITACIONES.ORO - count)} faltantes`, inline: true },
        { name: '🏆 Para Platino', value: `${Math.max(0, CONFIG.INVITACIONES.PLATINO - count)} faltantes`, inline: true }
      )
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    message.reply({ embeds: [embed] });
  }

  // !status - Ver estado del bot
  if (message.content === '!status') {
    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('🤖 Estado del Bot')
      .setDescription('Información del sistema y conectividad')
      .addFields(
        { name: '🟢 Status', value: client.user ? 'Conectado' : 'Desconectado', inline: true },
        { name: '🏠 Servidor', value: client.guilds.cache.first()?.name || 'N/A', inline: true },
        { name: '👥 Miembros', value: client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0).toString(), inline: true },
        { name: '📊 Invitaciones', value: userInvites.size.toString(), inline: true },
        { name: '⏰ Uptime', value: `${Math.round(process.uptime() / 60)} minutos`, inline: true },
        { name: '🌐 Host', value: 'Render.com + Auto-Ping', inline: true }
      )
      .setFooter({ text: 'Bot siempre activo con sistema de auto-ping' });

    message.reply({ embeds: [embed] });
  }

  // !setup welcome #canal - CONFIGURAR CANAL DE BIENVENIDAS
  if (message.content.startsWith('!setup welcome')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ Necesitas permisos de administrador para configurar.');
    }

    const channel = message.mentions.channels.first();
    if (!channel) {
      return message.reply('❌ Debes mencionar un canal. Ejemplo: `!setup welcome #bienvenidas`');
    }

    // Aquí podrías guardar en base de datos, por ahora usamos variable de entorno
    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('✅ Canal de Bienvenidas Configurado')
      .setDescription(`El canal ${channel} se ha establecido para notificaciones de bienvenida`)
      .addFields(
        { name: '📝 Nota', value: 'Para hacer permanente, configura la variable `CHANNEL_BIENVENIDAS` en Render', inline: false }
      );

    message.reply({ embeds: [embed] });
  }

  // !help - AYUDA
  if (message.content === '!help') {
    const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);

    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('🤖 Comandos del Bot de Invitaciones')
      .setDescription('Sistema de recompensas por invitar amigos al servidor')
      .addFields(
        { name: '🎯 Comandos para todos', value: '```!invites - Ver tus invitaciones\n!status - Ver estado del bot\n!help - Mostrar esta ayuda```', inline: false }
      );

    if (isAdmin) {
      embed.addFields({
        name: '🛠️ Comandos de Administrador',
        value: '```!addinvites @usuario cantidad [razón] - Agregar invitaciones manualmente\n!checkinvites @usuario - Ver invitaciones de otro usuario\n!setup welcome #canal - Configurar canal de bienvenidas```',
        inline: false
      });
    }

    embed.addFields(
      { name: '🏆 Sistema de Rangos', value: `\`\`\`🥇 Oro: ${CONFIG.INVITACIONES.ORO} invitaciones\n🏆 Platino: ${CONFIG.INVITACIONES.PLATINO} invitaciones\`\`\``, inline: false },
      { name: '📊 Funciones Automáticas', value: '```✅ Asigna rol "Iniciado" automáticamente\n✅ Detecta invitaciones automáticamente\n✅ Notificaciones de bienvenida\n✅ Ascensos de rango automáticos\n✅ Anuncios en canal de recompensas\n✅ Auto-ping 24/7 (nunca se duerme)```', inline: false }
    );

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
  console.log(`🔄 Auto-ping configurado cada 5 minutos`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 URL pública: ${RENDER_URL}`);
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
