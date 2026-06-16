FROM node:24-alpine

WORKDIR /app

COPY . /app

RUN mkdir -p /var/lib/nofida-hub-adapter \
  && chown -R node:node /app /var/lib/nofida-hub-adapter

ENV NODE_ENV=production
ENV PORT=3101

USER node

EXPOSE 3101

CMD ["node", "/app/server.mjs"]
