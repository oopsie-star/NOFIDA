FROM node:24-alpine

WORKDIR /app

COPY . /app

ENV NODE_ENV=production
ENV PORT=3101

USER node

EXPOSE 3101

CMD ["node", "/app/server.mjs"]
