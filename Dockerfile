FROM node:22-alpine

COPY ./server.mjs /mock/server.mjs

EXPOSE 4301 4300

CMD ["node", "/mock/server.mjs"]