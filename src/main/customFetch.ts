import pkg from './../../package.json'

export const customFetch = (url: string, options?: RequestInit): Promise<Response> => {
  options = options || {}
  const userAgent = options.headers?.['User-Agent'] || pkg.name + '/' + pkg.version

  if (options.method === 'GRAPHQL') {
    options.method = 'POST'
    options.headers = {
      ...options.headers,
      'Content-Type': 'application/json'
    }
    const body = options.body || ''
    let query = ''
    let variables = {}
    if (typeof body === 'string') {
      // Split the body into query and variables
      // Where the query and the variables are separated by two consecutive newlines
      const parts = body.split('\n\n')
      query = parts.slice(0, -1).join('\n').trim() // All but the last part are considered the query
      // but the last line is considered the query
      // last line is considered the variables
      if (parts.length > 1) {
        try {
          variables = JSON.parse(parts[parts.length - 1].trim())
        } catch (e) {
          console.error('Failed to parse variables:', e)
          variables = {}
        }
      }
    }
    options.body = JSON.stringify({
      query,
      variables
    })
  }

  options = {
    ...options,
    headers: {
      ...options.headers,
      'User-Agent': userAgent
    }
  }

  console.log('customFetch', url, options)

  return fetch(url, {
    ...options
  })
}
