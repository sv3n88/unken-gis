FROM php:8.2-cli-alpine

# Install PostgreSQL extension
RUN apk add --no-cache postgresql-dev && \
    docker-php-ext-install pgsql pdo_pgsql

COPY api/docker/php.ini /usr/local/etc/php/php.ini

WORKDIR /app

# Copy only specific files and directories
COPY app /app/
COPY api /app/api
COPY .env.docker /app/.env

# Use PHP's built-in web server
CMD ["php", "-S", "0.0.0.0:3000", "-t", "/app"]
