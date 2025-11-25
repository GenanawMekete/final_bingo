const logger = {
  info: (message, ...args) => {
    console.log(`ℹ️  ${message}`, ...args);
  },
  
  error: (message, ...args) => {
    console.error(`❌ ${message}`, ...args);
  },
  
  warn: (message, ...args) => {
    console.warn(`⚠️  ${message}`, ...args);
  },
  
  debug: (message, ...args) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🐛 ${message}`, ...args);
    }
  }
};

module.exports = logger;
