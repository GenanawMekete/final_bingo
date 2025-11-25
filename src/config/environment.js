const Joi = require('joi');

const envVarsSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  
  PORT: Joi.number()
    .default(3000),
  
  MONGODB_URI: Joi.string()
    .required()
    .description('MongoDB connection string'),
  
  TELEGRAM_BOT_TOKEN: Joi.string()
    .required()
    .description('Telegram Bot Token'),
  
  JWT_SECRET: Joi.string()
    .required()
    .description('JWT Secret Key'),
  
  CLIENT_URL: Joi.string()
    .default('http://localhost:3000')
    .description('Client application URL'),
  
  GAME_DURATION: Joi.number()
    .default(30)
    .description('Game duration in seconds'),
  
  LOBBY_DURATION: Joi.number()
    .default(30)
    .description('Lobby waiting time in seconds')
}).unknown()
  .required();

const { error, value: envVars } = envVarsSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

const config = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  mongoose: {
    url: envVars.MONGODB_URI,
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },
  telegram: {
    botToken: envVars.TELEGRAM_BOT_TOKEN,
    botUsername: envVars.TELEGRAM_BOT_USERNAME,
  },
  jwt: {
    secret: envVars.JWT_SECRET,
    expiresIn: envVars.JWT_EXPIRES_IN || '7d',
  },
  game: {
    duration: envVars.GAME_DURATION,
    lobbyDuration: envVars.LOBBY_DURATION,
    maxPlayers: envVars.MAX_PLAYERS_PER_ROOM || 100,
    minPlayers: envVars.MIN_PLAYERS_TO_START || 2,
  },
  client: {
    url: envVars.CLIENT_URL,
  }
};

module.exports = config;
