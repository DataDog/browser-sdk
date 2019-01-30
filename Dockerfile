FROM ubuntu:16.04

ENV DEBIAN_FRONTEND noninteractive
RUN apt-get update && \
    apt-get install -yy \
    bash \
    build-essential \
    curl \
    apt-transport-https

# Install node
RUN set -x \
 && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource.gpg.key | apt-key add - \
 && echo "deb https://deb.nodesource.com/node_11.x xenial main" > /etc/apt/sources.list.d/node.list \
 && apt-get update \
 && apt-get -y install --no-install-recommends nodejs \
 && apt-get -y clean \
 && rm -rf /var/lib/apt/lists/*

# node deps
RUN set -x \
 && npm install -g npm@6.5.0
