// Optional: your own TURN relay, used when two players' networks can't connect directly
// (typical for mobile data / carrier networks / strict Wi-Fi). Without one, "could not open a direct connection" can happen.
//
// Free option: create an account at https://www.metered.ca (TURN server, free tier), open your app's
// "TURN Credentials" page and copy the username + credential, then fill them in below and upload this file.
// (Credentials sit in public page source, which is normal for a static site; the free tier has a data cap, so don't share them.)
globalThis.CODUNGE_ICE = [
  { urls: 'turn:global.relay.metered.ca:80',                 username: '35fbe00967f496c44489e7e5', credential: '7l8W6XUUyvsYZWmg' },
  { urls: 'turn:global.relay.metered.ca:80?transport=tcp',   username: '35fbe00967f496c44489e7e5', credential: '7l8W6XUUyvsYZWmg' },
  { urls: 'turn:global.relay.metered.ca:443',                username: '35fbe00967f496c44489e7e5', credential: '7l8W6XUUyvsYZWmg' },
  { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: '35fbe00967f496c44489e7e5', credential: '7l8W6XUUyvsYZWmg' },
];
