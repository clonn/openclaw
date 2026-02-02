import { verifyToken, TokenPayload } from './auth-utils'

export async function requireAuth(request: Request): Promise<TokenPayload> {
  const authHeader = request.headers.get('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized')
  }

  const token = authHeader.slice(7)
  const payload = await verifyToken(token)

  if (!payload) {
    throw new Error('Invalid token')
  }

  return payload
}
