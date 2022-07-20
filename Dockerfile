FROM node:16.3.0-buster-slim

ARG CHROME_PACKAGE_VERSION

RUN test -n "$CHROME_PACKAGE_VERSION" || (echo "\nCHROME_PACKAGE_VERSION not set, you need to run:\ndocker build --build-arg CHROME_PACKAGE_VERSION=xxx\n" && false)

# Install Chrome deps
RUN apt-get update && apt-get install -y -q --no-install-recommends \
        libgtk-3-dev \
        libx11-xcb1  \
        libnss3 \
        libxss1 \
        libasound2 \
        fonts-liberation \
        libappindicator3-1 \
        lsb-release \
        xdg-utils \
        curl \
        ca-certificates \
        wget

# Download and install Chrome
# Debian taken from https://www.ubuntuupdates.org/package/google_chrome/stable/main/base/google-chrome-stable
RUN curl --silent --show-error --fail http://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/google-chrome-stable_${CHROME_PACKAGE_VERSION}_amd64.deb --output google-chrome.deb \
    && dpkg -i google-chrome.deb \
    && rm google-chrome.deb


# Install python
RUN apt-get install -y -q --no-install-recommends python

# Install pip
RUN set -x \
 && curl -OL https://bootstrap.pypa.io/pip/2.7/get-pip.py \
 && python get-pip.py \
 && rm get-pip.py

# Install AWS cli
RUN set -x \
 && pip install awscli

# Deploy deps
RUN apt-get install -y -q --no-install-recommends jq

# Node fsevents deps
RUN apt-get install -y -q --no-install-recommends g++ build-essential

# Datadog CI cli
RUN yarn global add @datadog/datadog-ci

# Gihub cli
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update && apt-get install -y -q gh

# Webdriverio deps
RUN mkdir -p /usr/share/man/man1

RUN apt-get install -y -q --no-install-recommends default-jdk

RUN apt-get -y install git

RUN apt-get -y install procps

# Woke
RUN curl -sSfL https://git.io/getwoke | \
  bash -s -- -b /usr/local/bin v0.17.1

# Codecov https://docs.codecov.com/docs/codecov-uploader
RUN apt-get -y install gnupg coreutils
RUN curl https://keybase.io/codecovsecurity/pgp_keys.asc | gpg --no-default-keyring --keyring trustedkeys.gpg --import
RUN CODECOV_UPLOADER_VERSION=v0.1.15 \
  && curl -Os https://uploader.codecov.io/${CODECOV_UPLOADER_VERSION}/linux/codecov \
  && curl -Os https://uploader.codecov.io/${CODECOV_UPLOADER_VERSION}/linux/codecov.SHA256SUM \
  && curl -Os https://uploader.codecov.io/${CODECOV_UPLOADER_VERSION}/linux/codecov.SHA256SUM.sig
RUN gpgv codecov.SHA256SUM.sig codecov.SHA256SUM
RUN shasum -a 256 -c codecov.SHA256SUM
RUN chmod +x codecov
RUN mv codecov /usr/local/bin
RUN rm codecov.*
