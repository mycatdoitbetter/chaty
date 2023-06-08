import { app, Datastore } from 'codehooks-js';
import fetch from 'node-fetch';

// Global middleware to IP rate limit traffic
app.use(async (req, res, next) => {
  const db = await Datastore.open();

  // Get client IP address
  const ipAddress = req.headers['x-real-ip'];

  // Increase count for IP
  const count = await db.incr('IP_count_' + ipAddress, 1, { ttl: 60 * 1000 });
  console.log(ipAddress, count);

  if (count > 10) {
    // Too many calls
    res.status(429).end('Sorry, too many requests for this IP');
  } else {
    // Proceed
    next();
  }
});

app.post('/chat', handleChatRequest);
app.post('/images', handleImagesRequest);

// Export app to the serverless runtime
export default app.init();

// Handle chat request
async function handleChatRequest(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).end('Please add your OPENAI_API_KEY');
  }

  const { ask } = req.body;
  const db = await Datastore.open();
  const cacheKey = 'chatapi_cache_' + ask;

  const cachedAnswer = await db.get(cacheKey);

  if (cachedAnswer) {
    res.end(cachedAnswer);
  } else {
    const { choices: { 0: { text } } } = await callOpenAiApi(ask);
    console.log(ask, text);

    await db.set(cacheKey, text, { ttl: 60 * 1000 });

    res.end(text);
  }
}

// Handle images request
async function handleImagesRequest(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).end('Please add your OPENAI_API_KEY');
  }

  const { prompt } = req.body;
  const db = await Datastore.open();
  const cacheKey = 'dall_e_api_cache_' + prompt;

  const cachedAnswer = await db.get(cacheKey);

  if (cachedAnswer) {
    res.end(cachedAnswer);
  } else {
    const data = await callOpenAiApiImage(prompt);
    console.log(prompt, JSON.stringify(data));

    await db.set(cacheKey, JSON.stringify(data), { ttl: 60 * 1000 });

    res.end(data);
  }
}

// Call OpenAI API for text
async function callOpenAiApi(ask) {
  const raw = JSON.stringify({
    model: 'text-davinci-003',
    prompt: ask,
    temperature: 0.6,
    max_tokens: 1024,
    stream: false,
  });

  const requestOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: raw,
    redirect: 'follow', //???
  };

  const response = await fetch('https://api.openai.com/v1/completions', requestOptions);
  return response.json();
}

// Call OpenAI API for images
async function callOpenAiApiImage(prompt) {
  const raw = JSON.stringify({
    prompt: prompt,
    n: 2,
    size: '1024x1024',
  });

  const requestOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: raw,
    redirect: 'follow',
  };

  const response = await fetch('https://api.openai.com/v1/images/generations', requestOptions);
  return response.json();
}