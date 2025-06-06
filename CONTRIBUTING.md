# Contributing

First of all, thanks for contributing!

This document provides some basic guidelines for contributing to this repository. To propose
improvements, feel free to submit a pull request.

## Getting Started

After downloading the repository, you need to download the Chrome extension. This will allow 
you to easily verify all the actions taken by the SDK.

### Download the Repository

You can use either Git or GitHub CLI:

```bash
# Using Git
git clone git@github.com:DataDog/browser-sdk.git

# Using GitHub CLI
gh repo clone DataDog/browser-sdk
```

## Install Dependencies

Run the following command to install the necessary dependencies:

```bash
yarn
```

## Install Browser Extension

Follow [this link][3] to download the browser extension. This extension will help you track 
all the information collected by the SDK.

## Running the Project

To run the project, use:

```bash
yarn dev
```

Then, go to [http://localhost:8080/react-app/](http://localhost:8080/react-app/). 
Open the developer tools and navigate to the `Browser SDK` tab to see all the information sent by the SDK.


## Submitting issues

Github issues are welcome, feel free to submit error reports and feature requests! Make sure to add
enough details to explain your use case. If you require further assistance, you can also contact
our [support][1].

## Pull Requests

Have you fixed a bug or written a new feature and want to share it? Many thanks!

In order to ease/speed up our review, here are some items you can check/improve when submitting your
pull request:

- Keep commits small and focused, rebase your branch if needed.
- Write unit and e2e tests for the code you wrote.
- Write meaningful [Commit messages and Pull Request
  titles](#commit-messages-and-pull-request-titles)

Our CI is not (yet) public, so it may be difficult to understand why your pull request status is
failing. Make sure that all tests pass locally, and we'll try to sort it out in our CI.

## Modules usage convention

Use index.ts files to expose a single, minimal API in directories where modules are used together.
Do not use index.ts when a directory contains independent modules.
An index.ts file should not have exports only used for spec files.

## Commit messages and Pull Request titles

Messages should be concise but explanatory. We are using a convention inspired by [gitmoji][2], to
label our Commit messages and Pull Request titles:

### User-facing changes

💥 - Breaking change.

✨ - New feature.

🐛 - Bug fix.

⚡️ - Performance improvement.

📝 - Documentation.

⚗ - Experimental.

### Internal changes

👷 - Updating project setup (continuous integration, build system, package dependencies...).

♻️ - Refactoring code.

🎨 - Improving structure / format of the code.

✅ - Updating tests.

👌 - Updating code due to code review changes.

[1]: https://docs.datadoghq.com/help/
[2]: https://gitmoji.carloscuesta.me/
[3]: https://chromewebstore.google.com/detail/datadog-browser-sdk-devel/boceobohkgenpcpogecpjlnmnfbdigda
