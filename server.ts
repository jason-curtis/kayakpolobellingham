// Cloudflare Workers entry point for Next.js app
import { Handler } from '@cloudflare/workers-types';
import app from './app'  ;

const handle: Handler = async (request: Request) => {
  // Import the Next.js request handler
  const { NextRequest, NextResponse } = await import('next/server');

  // Create a NextRequest from the incoming request
  const nextRequest = new NextRequest(request);

  // This should be handled by Next.js
  return new Response('Hello from Cloudflare Workers + Next.js!');
};

export default handle;
