import { createClient } from '@feltdb/core'
import { ProtocolError } from './auth-types'
// Canonical managed application discovery verifies identity; no boolean config-only health.
export async function verifyAuthority() {
 const { FELTDB_URL: url, FELTDB_TOKEN: token, FELTDB_APPLICATION_ID: applicationId, FELTDB_ENVIRONMENT: environment } = process.env
 if (!url || !token || !applicationId || !environment) throw new ProtocolError(503,'missing_authority_configuration')
 let parsed: URL
 try { parsed = new URL(url) } catch { throw new ProtocolError(503,'invalid_authority_configuration') }
 if (parsed.username || parsed.password || parsed.search || parsed.hash || (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:')) throw new ProtocolError(503,'invalid_authority_configuration')
 try { await createClient({ url, token, applicationId, environment }).application.get() } catch { throw new ProtocolError(503,'authority_unavailable') }
 return { ready: true, applicationId, environment }
}
