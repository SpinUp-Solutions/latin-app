const http = require('node:http');
const fs = require('node:fs');
let mode = 'success';
const captured = [];
http
  .createServer(async (req, res) => {
    let text = '';
    for await (const c of req) text += c;
    res.setHeader('content-type', 'application/json');
    if (req.url === '/control') {
      mode = JSON.parse(text).mode;
      res.end('{}');
      return;
    }
    if (req.url === '/captured') {
      res.end(JSON.stringify(captured));
      return;
    }
    const body = JSON.parse(text);
    captured.push({
      model: body.model,
      reasoning: body.reasoning,
      max_output_tokens: body.max_output_tokens,
      format: body.text?.format?.name,
      mode,
    });
    fs.writeFileSync(
      require('node:path').resolve(__dirname, '../provider-captured.json'),
      JSON.stringify(captured, null, 2)
    );
    if (mode === 'error') {
      res.writeHead(400);
      res.end(
        JSON.stringify({ error: { message: 'QA controlled provider rejection', type: 'invalid_request_error' } })
      );
      return;
    }
    await new Promise(r => setTimeout(r, 800));
    const content =
      mode === 'malformed'
        ? '{invalid json'
        : JSON.stringify({
            translation: 'hear',
            etymology: 'QA controlled response: Latin audire',
            definitions: ['to hear'],
            principal_parts: [
              { full_form: 'audio', shortened_form: 'audio' },
              { full_form: 'audire', shortened_form: 'audire' },
              { full_form: 'audivi', shortened_form: 'audivi' },
              { full_form: 'auditum', shortened_form: 'auditum' },
            ],
          });
    res.end(
      JSON.stringify({
        id: 'resp_qa117',
        object: 'response',
        model: body.model,
        status: mode === 'incomplete' ? 'incomplete' : 'completed',
        incomplete_details: mode === 'incomplete' ? { reason: 'max_output_tokens' } : null,
        output: [
          {
            type: 'message',
            status: mode === 'incomplete' ? 'incomplete' : 'completed',
            role: 'assistant',
            content: [{ type: 'output_text', text: content, annotations: [] }],
          },
        ],
        usage: {
          input_tokens: 1000,
          output_tokens: 4000,
          total_tokens: 5000,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 500 },
        },
      })
    );
  })
  .listen(5055, '127.0.0.1');
