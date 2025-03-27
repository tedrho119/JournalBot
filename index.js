require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Data stores
const channelJournals = new Map();
const channelTasks = new Map();

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  await client.application.commands.set([
    {
      name: 'today',
      description: 'Add a journal entry for today',
      options: [{
        name: 'content',
        description: 'Your journal content',
        type: 3,
        required: true
      }]
    },
    {
      name: 'task',
      description: 'Add or view tasks',
      options: [{
        name: 'content',
        description: 'Task to add (comma separated for multiple)',
        type: 3,
        required: false
      }]
    },
    {
      name: 'done',
      description: 'Complete a task',
      options: [{
        name: 'number',
        description: 'Task number to complete',
        type: 4,
        required: true
      }]
    },
    {
      name: 'help',
      description: 'Show how to use the bot'
    }
  ]);
  console.log('Commands registered!');
});

function createTaskEmbed(tasks) {
  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('📝 Task List')
    .setDescription(
      tasks.length > 0 
        ? `════════════════════\n\n${tasks.map((t, i) => `${i+1}. ${t}`).join('\n')}\n\n`
        : 'No tasks yet! Add one with `/task <content>`'
    );
}

function createJournalEmbed(date, entries) {
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`📅   ${date}`)
    .setDescription(
      `════════════════════\n\n` +
      `${entries.join('\n\n')}\n\n\n`
    );
}

function createHelpEmbed() {
  return new EmbedBuilder()
    .setColor(0x9b59b6) // Purple color
    .setTitle('📘 JournalBot Help')
    .setDescription(
      `════════════════════\n\n` +
      `**/today [content]**\n` +
      `Start or add to today's journal\n\n` +
      `**/task [tasks]**\n` +
      `Add new tasks (comma separated)\n\n` +
      `**/done [number]**\n` +
      `Complete a task by its number\n\n` +
      `**Examples:**\n` +
      `\`/today Finished the project!\`\n` +
      `\`/task Buy milk, Walk dog\`\n` +
      `\`/done 2\` (completes task #2)\n\n`
    );
}

async function updateMessagePosition(channel, oldMessageId, newEmbed, isJournal = false) {
  try {
    if (oldMessageId) {
      const oldMessage = await channel.messages.fetch(oldMessageId);
      await oldMessage.delete();
    }
    
    if (isJournal) {
      return await channel.send({ embeds: [newEmbed] });
    } else {
      const messages = await channel.messages.fetch({ limit: 1 });
      const firstMessage = messages.first();
      
      if (!firstMessage || !firstMessage.reference) {
        return await channel.send({ embeds: [newEmbed] });
      }
      
      try {
        return await firstMessage.reply({ embeds: [newEmbed] });
      } catch {
        return await channel.send({ embeds: [newEmbed] });
      }
    }
  } catch (error) {
    console.error('Error updating message position:', error);
    return await channel.send({ embeds: [newEmbed] });
  }
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const channelId = interaction.channelId;

  // Help Command
  if (interaction.commandName === 'help') {
    const embed = createHelpEmbed();
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // Journal Command
  if (interaction.commandName === 'today') {
    const content = interaction.options.getString('content');
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    if (!channelJournals.has(channelId)) {
      channelJournals.set(channelId, {
        date: today,
        entries: [],
        messageId: null
      });
    }
    
    const journalData = channelJournals.get(channelId);

    if (journalData.date !== today) {
      journalData.date = today;
      journalData.entries = [];
      journalData.messageId = null;
    }

    journalData.entries.push(content);

    const embed = createJournalEmbed(today, journalData.entries);
    
    const message = await updateMessagePosition(
      interaction.channel,
      journalData.messageId,
      embed,
      true
    );
    journalData.messageId = message.id;
    
    await interaction.deferReply({ ephemeral: true });
    await interaction.deleteReply();
  }
  
  // Task Commands
  else if (interaction.commandName === 'task' || interaction.commandName === 'done') {
    if (!channelTasks.has(channelId)) {
      channelTasks.set(channelId, {
        tasks: [],
        messageId: null
      });
    }
    
    const taskData = channelTasks.get(channelId);

    if (interaction.commandName === 'task') {
      const content = interaction.options.getString('content');
      
      if (content) {
        const newTasks = content.split(',').map(t => t.trim()).filter(t => t);
        taskData.tasks.push(...newTasks);
      }

      const embed = createTaskEmbed(taskData.tasks);
      
      const message = await updateMessagePosition(
        interaction.channel,
        taskData.messageId,
        embed,
        false
      );
      taskData.messageId = message.id;
      
      await interaction.deferReply({ ephemeral: true });
      await interaction.deleteReply();
    }
    else if (interaction.commandName === 'done') {
      const taskNumber = interaction.options.getInteger('number');
      
      if (taskNumber < 1 || taskNumber > taskData.tasks.length) {
        await interaction.deferReply({ ephemeral: true });
        await interaction.deleteReply();
        return;
      }
      
      taskData.tasks.splice(taskNumber - 1, 1);
      
      if (taskData.tasks.length === 0) {
        try {
          const message = await interaction.channel.messages.fetch(taskData.messageId);
          await message.delete();
          channelTasks.delete(channelId);
        } catch {
          channelTasks.delete(channelId);
        }
      } else {
        const embed = createTaskEmbed(taskData.tasks);
        const message = await updateMessagePosition(
          interaction.channel,
          taskData.messageId,
          embed,
          false
        );
        taskData.messageId = message.id;
      }
      
      await interaction.deferReply({ ephemeral: true });
      await interaction.deleteReply();
    }
  }
});

client.login(process.env.TOKEN);