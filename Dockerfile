FROM node:20-alpine

LABEL maintainer "Appknox <engineering@appknox.com>"

EXPOSE 3000

RUN mkdir /app && chown node -R /app
USER node
WORKDIR /app/

COPY --chown=node package*.json ./
RUN npm ci
COPY --chown=node . ./

CMD ["sh", "entrypoint.sh"]
