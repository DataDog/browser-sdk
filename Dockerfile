FROM node:25.6.1-bookworm-slim

ARG CHROME_PACKAGE_VERSION

SHELL ["/bin/bash", "-c"]
RUN test -n "$CHROME_PACKAGE_VERSION" || (echo "\nCHROME_PACKAGE_VERSION not set, you need to run:\ndocker build --build-arg CHROME_PACKAGE_VERSION=xxx\n" && false)

# Install Chrome deps
RUN apt-get update && apt-get install -y -q --no-install-recommends \
  libgcc-s1 \
  libgtk-3-dev \
  libx11-xcb1  \
  libnss3 \
  libxss1 \
  libasound2 \
  libu2f-udev \
  libvulkan1 \
  fonts-liberation \
  libappindicator3-1 \
  lsb-release \
  xdg-utils \
  curl \
  ca-certificates \
  wget \
  zip

# Download and install Chrome
# Debian taken from https://www.ubuntuupdates.org/package/google_chrome/stable/main/base/google-chrome-stable
RUN curl --silent --show-error --fail http://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/google-chrome-stable_${CHROME_PACKAGE_VERSION}_amd64.deb --output google-chrome.deb \
  && dpkg -i google-chrome.deb \
  && rm google-chrome.deb


# Install AWS cli
# https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
RUN set -x \
  && apt-get install -y -q --no-install-recommends unzip \
  && cd /tmp \
  && curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" \
  && unzip awscliv2.zip \
  && ./aws/install

# Node fsevents deps
RUN apt-get install -y -q --no-install-recommends g++ build-essential

# Datadog CI cli
RUN yarn global add @datadog/datadog-ci

# Gihub cli
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update && apt-get install -y -q gh

# DD Octo STS to get security token
COPY --from=registry.ddbuild.io/dd-octo-sts:v1.8.1@sha256:eb2895829cdcb1f41cc4fc9d1f3f329c7d8f6fa72b0e8bb915d8195717e02bfa /usr/local/bin/dd-octo-sts /usr/local/bin/dd-octo-sts

RUN apt-get update && apt-get install -y jq

# Webdriverio deps
RUN mkdir -p /usr/share/man/man1

RUN apt-get install -y -q --no-install-recommends default-jdk

RUN apt-get -y install git

RUN apt-get -y install procps

# Woke
RUN set -o pipefail \
  && curl -sSfL https://git.io/getwoke | bash -s -- -b /usr/local/bin v0.17.1

# Install authanywhere for pull request commenter token
RUN if [ $(uname -m) = x86_64 ]; then AAA="amd64"; else AAA="arm64"; fi; curl -OL "binaries.ddbuild.io/dd-source/authanywhere/LATEST/authanywhere-linux-${AAA}" && mv "authanywhere-linux-${AAA}" /bin/authanywhere && chmod +x /bin/authanywhere
