import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

export const logger = pino({
  level: LOG_LEVEL,
  transport: isProduction 
    ? undefined // Use default JSON logging in production/Vercel
    : process.env.NODE_ENV === "development"
      ? { 
          targets: [
            { 
              target: "pino-pretty", 
              options: { 
                colorize: true,
                translateTime: 'TR:yyyy-mm-dd HH:MM:ss',
                levelFirst: true,
                customLevels: 'info:30,debug:20,warn:40,error:50,fatal:60',
                customColors: 'info:blue,debug:green,warn:yellow,error:red,fatal:red'
              } 
            },
            { 
              target: "pino-pretty", 
              options: { 
                destination: "./debug.log",
                colorize: false,
                translateTime: 'TR:yyyy-mm-dd HH:MM:ss',
                levelFirst: true,
                customLevels: 'info:30,debug:20,warn:40,error:50,fatal:60'
              } 
            }
          ]
        }
      : undefined,
});
