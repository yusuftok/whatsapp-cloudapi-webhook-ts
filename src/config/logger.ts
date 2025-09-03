import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_FORMAT = process.env.LOG_FORMAT || 'auto';

// Determine if we should use pretty logging
const usePrettyLogging = () => {
  if (LOG_FORMAT === 'json') return false;
  if (LOG_FORMAT === 'pretty') return true;
  // AUTO: pretty in development, JSON in production/Vercel
  return process.env.NODE_ENV === 'development';
};

export const logger = pino({
  level: LOG_LEVEL,
  // Add human-readable timestamp in Turkish timezone for both JSON and pretty modes
  timestamp: () => `,"time":"${new Date().toLocaleString('tr-TR', { 
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })}"`,
  transport: usePrettyLogging() 
    ? { 
        targets: [
          { 
            target: "pino-pretty", 
            options: { 
              colorize: true,
              translateTime: 'SYS:yyyy-mm-dd HH:MM:ss o',
              levelFirst: true,
              ignore: 'pid,hostname',
              messageFormat: '{msg}',
              customLevels: 'info:30,debug:20,warn:40,error:50,fatal:60',
              customColors: 'info:blue,debug:green,warn:yellow,error:red,fatal:red'
            } 
          },
          ...(process.env.NODE_ENV === 'development' ? [{
            target: "pino-pretty", 
            options: { 
              destination: "./debug.log",
              colorize: false,
              translateTime: 'SYS:yyyy-mm-dd HH:MM:ss o',
              levelFirst: true,
              ignore: 'pid,hostname',
              customLevels: 'info:30,debug:20,warn:40,error:50,fatal:60'
            } 
          }] : [])
        ]
      }
    : undefined, // JSON logging with Turkish timestamp
});
