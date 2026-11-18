# syntax=docker/dockerfile:1
FROM node:24-alpine

# 原生 type-stripping：源码直接运行，无需 npm install 构建步骤
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public

# 配置一律走环境变量，不把 config.json 烤进镜像
ENV PORT=3000 \
    DATA_DIR=data \
    DB_FILE=license.db
EXPOSE 3000

VOLUME ["/app/data"]
CMD ["node", "src/server.ts"]
