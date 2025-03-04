import * as prettier from 'prettier'
import type { Document, Block, Header, RequestFormData } from './DocumentParser'

const DEFAULT_MULTIPART_BOUNDARY = '----KulalaBoundary'

function headerToPascalCase(str: string): string {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('-')
}

const formatSimpleFormBody = (body: string): string => {
  body = body.replace(/\n/g, '').replace(/\s+/g, '')
  const parts = body.split('&')
  if (parts.length === 1) {
    return parts[0]
  }
  return parts.join('&\n').replace(/\n\s*\n/g, '\n')
}

const getMultipartFormBoundary = (headers: Header[]): string => {
  const contentTypeHeader = getHeader(headers, 'content-type')
  if (!contentTypeHeader) {
    return DEFAULT_MULTIPART_BOUNDARY
  }
  const boundaryMatch = contentTypeHeader.match(/boundary=(.+)/)
  if (!boundaryMatch) {
    return DEFAULT_MULTIPART_BOUNDARY
  }
  return boundaryMatch[1]
}

const formatMultipartFormBody = (headers: Header[], requestFormData: RequestFormData[]): string => {
  let body = ''
  const boundary = getMultipartFormBoundary(headers)
  const len = requestFormData.length - 1
  requestFormData.forEach((field, idx) => {
    if (field.type === 'file') {
      body += `--${boundary}\n`
      body += `Content-Disposition: form-data; name="${field.key}"; filename="${field.file?.fileName}"\n`
      body += `Content-Type: ${field.file?.contentType}\n\n`
      body += `${field.value}\n`
      if (idx !== len) {
        body += `--${boundary}\n`
      }
    } else {
      body += `--${boundary}\n`
      body += `Content-Disposition: form-data; name="${field.key}"\n\n`
      body += `${field.value}\n`
      if (idx !== len) {
        body += `--${boundary}\n`
      }
    }
    body += `--${boundary}--\n`
  })
  return body
}

// Get header value based on case insensitive key
function getHeader(headers: Header[], key: string): string | undefined {
  const header = headers.find((header) => header.key.toLowerCase() === key.toLowerCase())
  return header?.value
}

// Helper function to split GraphQL body and variables
function splitGraphQLBody(body: string): {
  query: string
  variables: string | null
} {
  // Split on first occurrence of two newlines followed by a JSON-like structure
  const parts = body.split(/\n\s*\n(\s*{)/)

  if (parts.length >= 2) {
    // Rejoin the JSON part if it was split
    const variables = parts.slice(1).join('')
    return {
      query: parts[0].trim(),
      variables: variables.trim()
    }
  }

  return {
    query: body.trim(),
    variables: null
  }
}

const getFormatParser = (block: Block): null | 'graphql' | 'json' => {
  const headers = block.request?.headers || []
  if (getHeader(headers, 'x-request-type') === 'graphql') {
    return 'graphql'
  }
  if (getHeader(headers, 'content-type') === 'application/json') {
    return 'json'
  }
  return null
}

function replaceCommentPrefix(comment: string): string {
  return comment.replace(/^(\/\/)/, '#')
}

function preservePlaceholders(body: string): {
  replacedBody: string
  placeholders: Map<string, string>
} {
  const placeholderRegex = /(?<!")({{\$?\w+}})(?!")/g
  const placeholders = new Map<string, string>()
  let replacedBody = body

  replacedBody = replacedBody.replace(placeholderRegex, (match) => {
    const key = `__KULALA_FMT_PLACEHOLDER_${placeholders.size}__`
    placeholders.set(key, match)
    return `"${key}"`
  })
  replacedBody = replacedBody.replace(/""/g, '')

  return { replacedBody, placeholders }
}

function restorePlaceholders(formattedBody: string, placeholders: Map<string, string>): string {
  let restoredBody = formattedBody
  const placeholdersLength = placeholders.size
  let idx = 0
  placeholders.forEach((original, key) => {
    let firstQuote = ''
    let lastQuote = ''
    if (idx === 0) {
      firstQuote = '"'
    }
    if (idx === placeholdersLength - 1) {
      lastQuote = '"'
    }
    restoredBody = restoredBody.replace(`${firstQuote}${key}${lastQuote}`, original)
    idx++
  })
  return restoredBody
}

const build = async (document: Document, formatBody: boolean = true): Promise<string> => {
  let output = ''

  for (const variable of document.variables) {
    output += `@${variable.key} = ${variable.value}\n`
  }
  output += '\n'

  for (const block of document.blocks) {
    const requestSeparatorText = block.requestSeparator.text
      ? ` ${block.requestSeparator.text}`
      : ''
    output += `\n###${requestSeparatorText}\n\n`

    if (block.comments.length > 0) {
      for (const comment of block.comments) {
        output += `${replaceCommentPrefix(comment)}`
      }
    }
    if (block.preRequestScripts.length > 0) {
      for (const script of block.preRequestScripts) {
        output += `< ${script.script}\n`
      }
    }
    if (block.metadata.length > 0) {
      for (const metadata of block.metadata) {
        output += `# @${metadata.key} ${metadata.value}\n`
      }
    }
    if (block.request) {
      const formatParser = getFormatParser(block)
      const contentType = getHeader(block.request.headers, 'content-type')
      const multipartFormData = block.request.multipartFormData
      output += `${block.request.method} ${block.request.url} ${block.request.httpVersion}\n`
      if (!contentType && multipartFormData) {
        output += `Content-Type: multipart/form-data; boundary=${DEFAULT_MULTIPART_BOUNDARY}\n`
      }
      for (const header of block.request.headers) {
        let headerKey = header.key
        switch (block.request.httpVersion) {
          case 'HTTP/1.0':
          case 'HTTP/1.1':
            headerKey = headerToPascalCase(header.key)
            break
          case 'HTTP/2':
          case 'HTTP/3':
            headerKey = header.key.toLowerCase()
            break
        }
        output += `${headerKey}: ${header.value}\n`
      }
      if (block.request.body) {
        let body = block.request.body.trim()
        const contentType = getHeader(block.request.headers, 'content-type')
        if (formatBody) {
          if (formatParser === 'graphql') {
            try {
              const { replacedBody, placeholders } = preservePlaceholders(body)
              const { query, variables } = splitGraphQLBody(replacedBody)

              const formattedQuery = await prettier.format(query, {
                parser: formatParser
              })

              // Format the variables if they exist
              let formattedVariables = ''
              if (variables) {
                formattedVariables = await prettier.format(variables, {
                  parser: 'json'
                })
              }
              body = formattedQuery.trim()
              if (formattedVariables) {
                body += `\n\n${formattedVariables.trim()}`
              }
              body = restorePlaceholders(body, placeholders).trim()
            } catch (err) {
              const error = err as Error
              console.log(error.message)
              process.exit(1)
            }
          } else if (formatParser === 'json') {
            try {
              const { replacedBody, placeholders } = preservePlaceholders(body)

              body = await prettier.format(replacedBody, {
                parser: formatParser
              })

              body = restorePlaceholders(body, placeholders).trim()
            } catch (err) {
              const error = err as Error
              console.log(error.message)
              process.exit(1)
            }
          }
        }
        if (contentType === 'application/x-www-form-urlencoded') {
          body = formatSimpleFormBody(body)
        }
        output += `\n${body}\n`
      }
    }
    if (block.request?.multipartFormData) {
      const body = formatMultipartFormBody(
        block.request.headers,
        block.request.multipartFormData || []
      )
      output += `\n${body}\n`
    }
    if (block.postRequestScripts.length > 0) {
      for (const script of block.postRequestScripts) {
        output += `\n> ${script.script}\n`
      }
    }
    if (block.responseRedirect) {
      output += `\n${block.responseRedirect}\n`
    }
  }
  output = output.trim() + '\n'
  return output
}

export const DocumentBuilder = {
  build
}
