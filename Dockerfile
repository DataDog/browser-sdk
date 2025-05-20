FROM node:23.11.1-bookworm-slim

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

# Webdriverio deps
RUN mkdir -p /usr/share/man/man1

RUN apt-get install -y -q --no-install-recommends default-jdk

RUN apt-get -y install git

RUN apt-get -y install procps

# Woke
RUN set -o pipefail \
  && curl -sSfL https://git.io/getwoke | bash -s -- -b /usr/local/bin v0.17.1

# Codecov https://docs.codecov.com/docs/codecov-uploader
RUN apt-get -y install gnupg coreutils \
  && set -o pipefail && curl https://keybase.io/codecovsecurity/pgp_keys.asc | gpg --no-default-keyring --keyring trustedkeys.gpg --import \
  && CODECOV_UPLOADER_VERSION=v0.1.15 \
  && curl -Os https://uploader.codecov.io/${CODECOV_UPLOADER_VERSION}/linux/codecov \
  && curl -Os https://uploader.codecov.io/${CODECOV_UPLOADER_VERSION}/linux/codecov.SHA256SUM \
  && curl -Os https://uploader.codecov.io/${CODECOV_UPLOADER_VERSION}/linux/codecov.SHA256SUM.sig \
  && gpgv codecov.SHA256SUM.sig codecov.SHA256SUM \
  && shasum -a 256 -c codecov.SHA256SUM \
  && chmod +x codecov \
  && mv codecov /usr/local/bin \
  && rm codecov.*

# Install authanywhere for pull request commenter token
RUN if [ $(uname -m) = x86_64 ]; then AAA="amd64"; else AAA="arm64"; fi; curl -OL "binaries.ddbuild.io/dd-source/authanywhere/LATEST/authanywhere-linux-${AAA}" && mv "authanywhere-linux-${AAA}" /bin/authanywhere && chmod +x /bin/authanywhere 
