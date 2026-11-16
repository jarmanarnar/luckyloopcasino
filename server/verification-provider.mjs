// Server-only adapter. No credentials or provider verification IDs are sent to the browser.
// https://www.twilio.com/docs/verify/api/verification
// https://www.twilio.com/docs/verify/api/verification-check
export function createVerificationProvider({ accountSid, authToken, serviceSid, channels = [], fetch: request = fetch } = {}) {
  const configured = /^AC[a-f0-9]{32}$/i.test(accountSid || '') && Boolean(authToken) && /^VA[a-f0-9]{32}$/i.test(serviceSid || '');
  const supported = configured ? channels.filter(channel => ['email', 'phone'].includes(channel)) : [];
  async function post(resource, data) {
    const response = await request(`https://verify.twilio.com/v2/Services/${serviceSid}/${resource}`, {
      method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(data), signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    // Do not expose provider error bodies, codes or contact details to logs/the client.
    if (!response.ok) throw new Error('Verification service could not complete the request.');
    return response.json();
  }
  return {
    channels: supported,
    async start(channel, destination) {
      if (!supported.includes(channel)) throw new Error('Verification is not connected.');
      const result = await post('Verifications', { To: destination, Channel: channel === 'phone' ? 'sms' : 'email' });
      if (result.status !== 'pending' || !/^VE[a-f0-9]{32}$/i.test(result.sid || '')) throw new Error('Verification could not be started.');
      return result.sid;
    },
    async check(providerId, code) {
      if (!configured || !/^VE[a-f0-9]{32}$/i.test(providerId || '')) return false;
      const result = await post('VerificationCheck', { VerificationSid: providerId, Code: code });
      return result.sid === providerId && result.status === 'approved';
    },
  };
}
