import * as cheerio from 'cheerio';
import { parsePartialResponse } from './partial-response.js';

export function extractViewStateFromHtml(html: string): string | null {
  const $ = cheerio.load(html);
  const value = $('input[name="javax.faces.ViewState"]').attr('value');
  return value ?? null;
}

export function extractViewStateFromPartialResponse(xml: string): string | null {
  const result = parsePartialResponse(xml);
  return result.viewState ?? null;
}
