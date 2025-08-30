import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

export const logger = pino({
  level: LOG_LEVEL,
  transport:
    process.env.NODE_ENV === "development"
      ? { 
          targets: [
            { 
              target: "pino-pretty", 
              options: { 
                colorize: true,
                translateTime: 'SYS:yyyy-mm-dd HH:MM:ss'
              } 
            },
            { 
              target: "pino-pretty", 
              options: { 
                destination: "./debug.log",
                colorize: false,
                translateTime: 'SYS:yyyy-mm-dd HH:MM:ss'
              } 
            }
          ]
        }
      : undefined,
});
