// cli/parser.test.ts
import { describe, it, expect } from 'vitest'
import { parseJsonlContent } from './parser'

describe('parseJsonlContent', () => {
  it('extracts assistant messages with usage data', () => {
    const lines = [
      JSON.stringify({
        type: 'assistant',
        uuid: 'msg-1',
        timestamp: '2026-03-13T10:00:00Z',
        sessionId: 'sess-1',
        cwd: '/test',
        gitBranch: 'main',
        version: '2.1.75',
        message: {
          id: 'api-1',
          model: 'claude-opus-4-6',
          role: 'assistant',
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'Hello world, this is a test response' }],
          usage: {
            input_tokens: 1000,
            output_tokens: 500,
            cache_creation_input_tokens: 800,
            cache_read_input_tokens: 200,
            cache_creation: {
              ephemeral_5m_input_tokens: 0,
              ephemeral_1h_input_tokens: 800,
            },
          },
        },
      }),
    ].join('\n')

    const result = parseJsonlContent(lines, 'sess-1')

    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].model).toBe('claude-opus-4-6')
    expect(result.messages[0].inputTokens).toBe(1000)
    expect(result.messages[0].outputTokens).toBe(500)
    expect(result.messages[0].cacheCreation1hTokens).toBe(800)
    expect(result.messages[0].cacheReadTokens).toBe(200)
    expect(result.messages[0].preview).toBe('Hello world, this is a test response')
  })

  it('deduplicates by message.id keeping final entry', () => {
    const lines = [
      JSON.stringify({
        type: 'assistant', uuid: 'msg-1a', timestamp: '2026-03-13T10:00:00Z',
        sessionId: 'sess-1', cwd: '/test', gitBranch: 'main', version: '2.1.75',
        message: {
          id: 'api-1', model: 'claude-opus-4-6', role: 'assistant',
          stop_reason: null,
          content: [{ type: 'text', text: 'Hel' }],
          usage: { input_tokens: 1000, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        },
      }),
      JSON.stringify({
        type: 'assistant', uuid: 'msg-1b', timestamp: '2026-03-13T10:00:01Z',
        sessionId: 'sess-1', cwd: '/test', gitBranch: 'main', version: '2.1.75',
        message: {
          id: 'api-1', model: 'claude-opus-4-6', role: 'assistant',
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'Hello world' }],
          usage: { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        },
      }),
    ].join('\n')

    const result = parseJsonlContent(lines, 'sess-1')
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].outputTokens).toBe(500)
  })

  it('skips synthetic model entries', () => {
    const lines = [
      JSON.stringify({
        type: 'assistant', uuid: 'msg-1', timestamp: '2026-03-13T10:00:00Z',
        sessionId: 'sess-1', cwd: '/test', gitBranch: 'main', version: '2.1.75',
        message: {
          id: 'api-1', model: '<synthetic>', role: 'assistant',
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'synthetic' }],
          usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        },
      }),
    ].join('\n')

    const result = parseJsonlContent(lines, 'sess-1')
    expect(result.messages).toHaveLength(0)
  })

  it('skips non-assistant/non-user entries', () => {
    const lines = [
      JSON.stringify({ type: 'progress', uuid: 'p1', data: {} }),
      JSON.stringify({ type: 'system', uuid: 's1', subtype: 'turn_duration' }),
      JSON.stringify({ type: 'file-history-snapshot', messageId: 'fh1', snapshot: {} }),
    ].join('\n')

    const result = parseJsonlContent(lines, 'sess-1')
    expect(result.messages).toHaveLength(0)
  })

  it('extracts user messages for display', () => {
    const lines = [
      JSON.stringify({
        type: 'user', uuid: 'u1', timestamp: '2026-03-13T10:00:00Z',
        sessionId: 'sess-1', cwd: '/home/user/project', gitBranch: 'feature-x',
        version: '2.1.75', message: { role: 'user', content: 'What is the weather?' },
      }),
    ].join('\n')

    const result = parseJsonlContent(lines, 'sess-1')
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].role).toBe('user')
    expect(result.messages[0].inputTokens).toBe(0)
    expect(result.messages[0].preview).toBe('What is the weather?')
  })

  it('extracts tool call names from assistant content', () => {
    const lines = [
      JSON.stringify({
        type: 'assistant', uuid: 'msg-1', timestamp: '2026-03-13T10:00:00Z',
        sessionId: 'sess-1', cwd: '/test', gitBranch: 'main', version: '2.1.75',
        message: {
          id: 'api-1', model: 'claude-opus-4-6', role: 'assistant',
          stop_reason: 'tool_use',
          content: [
            { type: 'text', text: 'Let me check' },
            { type: 'tool_use', name: 'Read', id: 't1', input: {} },
            { type: 'tool_use', name: 'Bash', id: 't2', input: {} },
          ],
          usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        },
      }),
    ].join('\n')

    const result = parseJsonlContent(lines, 'sess-1')
    expect(result.messages[0].toolCalls).toEqual(['Read', 'Bash'])
  })

  it('extracts web search requests from server_tool_use', () => {
    const lines = [
      JSON.stringify({
        type: 'assistant', uuid: 'msg-1', timestamp: '2026-03-13T10:00:00Z',
        sessionId: 'sess-1', cwd: '/test', gitBranch: 'main', version: '2.1.75',
        message: {
          id: 'api-1', model: 'claude-opus-4-6', role: 'assistant',
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'search results' }],
          usage: {
            input_tokens: 100, output_tokens: 50,
            cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
            server_tool_use: { web_search_requests: 3 },
          },
        },
      }),
    ].join('\n')

    const result = parseJsonlContent(lines, 'sess-1')
    expect(result.messages[0].webSearchRequests).toBe(3)
  })

  it('attaches tool results to preceding assistant message', () => {
    const lines = [
      // Assistant calls Read tool
      JSON.stringify({
        type: 'assistant', uuid: 'msg-1', timestamp: '2026-03-13T10:00:00Z',
        sessionId: 'sess-1', cwd: '/test', gitBranch: 'main', version: '2.1.75',
        message: {
          id: 'api-1', model: 'claude-opus-4-6', role: 'assistant',
          stop_reason: 'tool_use',
          content: [
            { type: 'text', text: 'Let me read' },
            { type: 'tool_use', name: 'Read', id: 'tool-1', input: { path: '/test.ts' } },
          ],
          usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        },
      }),
      // Tool result (shows as "user" in JSONL)
      JSON.stringify({
        type: 'user', uuid: 'u-tr', timestamp: '2026-03-13T10:00:01Z',
        sessionId: 'sess-1', toolUseResult: true,
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'const x = 42;' }],
        },
      }),
    ].join('\n')

    const result = parseJsonlContent(lines, 'sess-1')
    // Should only have 1 message (assistant), no user row for tool result
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].role).toBe('assistant')
    expect(result.messages[0].toolResults).toHaveLength(1)
    expect(result.messages[0].toolResults[0].name).toBe('Read')
    expect(result.messages[0].toolResults[0].preview).toBe('const x = 42;')
  })

  it('filters out tool result user messages but keeps real user messages', () => {
    const lines = [
      // Real user message
      JSON.stringify({
        type: 'user', uuid: 'u1', timestamp: '2026-03-13T10:00:00Z',
        sessionId: 'sess-1', cwd: '/test', gitBranch: 'main', version: '2.1.75',
        message: { role: 'user', content: 'Hello there' },
      }),
      // Tool result (should be filtered)
      JSON.stringify({
        type: 'user', uuid: 'u2', timestamp: '2026-03-13T10:00:01Z',
        sessionId: 'sess-1', toolUseResult: true,
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'result' }],
        },
      }),
      // Meta message (should be filtered)
      JSON.stringify({
        type: 'user', uuid: 'u3', timestamp: '2026-03-13T10:00:02Z',
        sessionId: 'sess-1', isMeta: true,
        message: { role: 'user', content: [{ type: 'text', text: '<system>injected</system>' }] },
      }),
    ].join('\n')

    const result = parseJsonlContent(lines, 'sess-1')
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].role).toBe('user')
    expect(result.messages[0].preview).toBe('Hello there')
  })

  it('captures session metadata from first entry', () => {
    const lines = [
      JSON.stringify({
        type: 'user', uuid: 'u1', timestamp: '2026-03-13T10:00:00Z',
        sessionId: 'sess-1', cwd: '/home/user/project', gitBranch: 'feature-x',
        version: '2.1.75', message: { role: 'user', content: 'hi' },
      }),
    ].join('\n')

    const result = parseJsonlContent(lines, 'sess-1')
    expect(result.cwd).toBe('/home/user/project')
    expect(result.gitBranch).toBe('feature-x')
    expect(result.version).toBe('2.1.75')
  })

  it('extracts isError from tool result blocks', () => {
    const lines = [
      // Assistant calls Bash tool
      JSON.stringify({
        type: 'assistant', uuid: 'msg-1', timestamp: '2026-03-13T10:00:00Z',
        sessionId: 'sess-1', cwd: '/test', gitBranch: 'main', version: '2.1.75',
        message: {
          id: 'api-1', model: 'claude-opus-4-6', role: 'assistant',
          stop_reason: 'tool_use',
          content: [
            { type: 'text', text: 'Running command' },
            { type: 'tool_use', name: 'Bash', id: 'tool-err', input: {} },
          ],
          usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        },
      }),
      // Tool result with is_error: true
      JSON.stringify({
        type: 'user', uuid: 'u-tr', timestamp: '2026-03-13T10:00:01Z',
        sessionId: 'sess-1', toolUseResult: true,
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tool-err', content: 'Command not found', is_error: true }],
        },
      }),
    ].join('\n')

    const result = parseJsonlContent(lines, 'sess-1')
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].toolResults).toHaveLength(1)
    expect(result.messages[0].toolResults[0].isError).toBe(true)
    expect(result.messages[0].toolResults[0].name).toBe('Bash')
  })

  it('sets isError to false when is_error is absent', () => {
    const lines = [
      JSON.stringify({
        type: 'assistant', uuid: 'msg-1', timestamp: '2026-03-13T10:00:00Z',
        sessionId: 'sess-1', cwd: '/test', gitBranch: 'main', version: '2.1.75',
        message: {
          id: 'api-1', model: 'claude-opus-4-6', role: 'assistant',
          stop_reason: 'tool_use',
          content: [
            { type: 'tool_use', name: 'Read', id: 'tool-ok', input: {} },
          ],
          usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        },
      }),
      JSON.stringify({
        type: 'user', uuid: 'u-tr', timestamp: '2026-03-13T10:00:01Z',
        sessionId: 'sess-1', toolUseResult: true,
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tool-ok', content: 'file contents' }],
        },
      }),
    ].join('\n')

    const result = parseJsonlContent(lines, 'sess-1')
    expect(result.messages[0].toolResults[0].isError).toBe(false)
  })

  it('returns modelCounts with correct tallies', () => {
    const lines = [
      JSON.stringify({
        type: 'assistant', uuid: 'msg-1', timestamp: '2026-03-13T10:00:00Z',
        sessionId: 'sess-1', cwd: '/test', gitBranch: 'main', version: '2.1.75',
        message: {
          id: 'api-1', model: 'claude-opus-4-6', role: 'assistant',
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'Hello' }],
          usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        },
      }),
      JSON.stringify({
        type: 'assistant', uuid: 'msg-2', timestamp: '2026-03-13T10:01:00Z',
        sessionId: 'sess-1', cwd: '/test', gitBranch: 'main', version: '2.1.75',
        message: {
          id: 'api-2', model: 'claude-opus-4-6', role: 'assistant',
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'World' }],
          usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        },
      }),
      JSON.stringify({
        type: 'assistant', uuid: 'msg-3', timestamp: '2026-03-13T10:02:00Z',
        sessionId: 'sess-1', cwd: '/test', gitBranch: 'main', version: '2.1.75',
        message: {
          id: 'api-3', model: 'claude-sonnet-4-6', role: 'assistant',
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'Hi' }],
          usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        },
      }),
    ].join('\n')

    const result = parseJsonlContent(lines, 'sess-1')
    expect(result.modelCounts).toEqual({ 'claude-opus-4-6': 2, 'claude-sonnet-4-6': 1 })
    expect(result.models).toEqual(['claude-opus-4-6', 'claude-sonnet-4-6']) // sorted by frequency
  })

  it('extracts agentId from Agent tool_use input', () => {
    const lines = [
      JSON.stringify({
        type: 'assistant', uuid: 'msg-1', timestamp: '2026-03-13T10:00:00Z',
        sessionId: 'sess-1', cwd: '/test', gitBranch: 'main', version: '2.1.75',
        message: {
          id: 'api-1', model: 'claude-opus-4-6', role: 'assistant',
          stop_reason: 'tool_use',
          content: [
            { type: 'tool_use', name: 'Agent', id: 'tool-agent', input: { description: 'test', prompt: 'do stuff', agentId: 'agent-abc123' } },
          ],
          usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        },
      }),
      JSON.stringify({
        type: 'user', uuid: 'u-tr', timestamp: '2026-03-13T10:00:01Z',
        sessionId: 'sess-1', toolUseResult: true,
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tool-agent', content: 'Agent completed' }],
        },
      }),
    ].join('\n')

    const result = parseJsonlContent(lines, 'sess-1')
    expect(result.messages[0].toolResults[0].agentId).toBe('agent-abc123')
  })

  it('omits agentId when not present in Agent tool input', () => {
    const lines = [
      JSON.stringify({
        type: 'assistant', uuid: 'msg-1', timestamp: '2026-03-13T10:00:00Z',
        sessionId: 'sess-1', cwd: '/test', gitBranch: 'main', version: '2.1.75',
        message: {
          id: 'api-1', model: 'claude-opus-4-6', role: 'assistant',
          stop_reason: 'tool_use',
          content: [
            { type: 'tool_use', name: 'Agent', id: 'tool-agent2', input: { description: 'test', prompt: 'do stuff' } },
          ],
          usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        },
      }),
      JSON.stringify({
        type: 'user', uuid: 'u-tr', timestamp: '2026-03-13T10:00:01Z',
        sessionId: 'sess-1', toolUseResult: true,
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tool-agent2', content: 'Done' }],
        },
      }),
    ].join('\n')

    const result = parseJsonlContent(lines, 'sess-1')
    expect(result.messages[0].toolResults[0].agentId).toBeUndefined()
  })
})
