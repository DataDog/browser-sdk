// Identifiers whose values are never captured, normalized by `normalizeIdentifier`. This is the
// list the Datadog tracers redact in Dynamic Instrumentation and Exception Replay snapshots.
const REDACTED_IDENTIFIERS = new Set(
  (
    '2fa accesstoken aiohttpsession apikey apisecret apisignature appkey applicationkey auth authorization ' +
    'authtoken ccnumber certificatepin cipher clientid clientsecret connectionstring connectsid cookie ' +
    'credentials creditcard csrf csrftoken cvv databaseurl dburl encryptionkey encryptionkeyid geolocation ' +
    'gpgkey ipaddress jti jwt licensekey masterkey mysqlpwd nonce oauth oauthtoken otp passhash passwd ' +
    'password passwordb pemfile pgpkey phpsessid pin pincode pkcs8 privatekey publickey pwd recaptchakey ' +
    'refreshtoken routingnumber salt secret secretkey secrettoken securityanswer securitycode ' +
    'securityquestion serviceaccountcredentials session sessionid sessionkey setcookie signature ' +
    'signaturekey sshkey ssn symfony token transactionid twiliotoken usersession voterid xapikey xauthtoken ' +
    'xcsrftoken xforwardedfor xrealip xsrf xsrftoken'
  ).split(' ')
)

const IDENTIFIER_SEPARATORS = /[-_@$.]/g

/**
 * Whether the value of a variable, argument, property or map entry with this name must be redacted
 * from snapshots. Matching ignores case and the `-`, `_`, `@`, `$` and `.` separators, so
 * `api_key`, `apiKey` and `X-Api-Key` all match `apikey`.
 */
export function isRedactedIdentifier(name: string): boolean {
  return REDACTED_IDENTIFIERS.has(normalizeIdentifier(name))
}

function normalizeIdentifier(name: string): string {
  return name.trim().toLowerCase().replace(IDENTIFIER_SEPARATORS, '')
}
