# Salesforce E2E

This suite validates Salesforce view tracking against a deployed `ebikes` org by intercepting real
RUM intake requests in Playwright.

Required environment variables:

- `SALESFORCE_EBIKES_SITE_URL`
- `SALESFORCE_EBIKES_ORG_ALIAS`
