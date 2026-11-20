FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY services ./services
COPY public ./public
COPY start-all.js ./
EXPOSE 3000 4001 4002 4003
CMD ["node", "--no-warnings", "start-all.js"]
