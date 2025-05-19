import ApiEndpoints from './api-endpoints';
import { IObfuscatedPrecomputedConfigurationResponse } from './configuration-wire/configuration-wire-types';
import {
  Environment,
  FormatEnum,
  PrecomputedFlagsPayload,
} from './interfaces';
import { Attributes } from './types';

export interface IQueryParams {
  apiKey: string;
  sdkVersion: string;
  sdkName: string;
}

export interface IQueryParamsWithSubject extends IQueryParams {
  subjectKey: string;
  subjectAttributes: Attributes;
}

export class HttpRequestError extends Error {
  constructor(
    public message: string,
    public status: number,
    public cause?: Error,
  ) {
    super(message);
    if (cause) {
      this.cause = cause;
    }
  }
}

export interface IHttpClient {
  getPrecomputedFlags(
    payload: PrecomputedFlagsPayload,
  ): Promise<IObfuscatedPrecomputedConfigurationResponse | undefined>;
  rawGet<T>(url: string): Promise<T | undefined>;
  rawPost<T, P>(url: string, payload: P): Promise<T | undefined>;
}

export default class FetchHttpClient implements IHttpClient {
  constructor(
    private readonly apiEndpoints: ApiEndpoints,
    private readonly timeout: number,
  ) { }

  async getPrecomputedFlags(
    payload: PrecomputedFlagsPayload,
  ): Promise<IObfuscatedPrecomputedConfigurationResponse | undefined> {
    const url = this.apiEndpoints.precomputedFlagsEndpoint();
    return await this.rawPost<IObfuscatedPrecomputedConfigurationResponse, PrecomputedFlagsPayload>(
      url,
      payload,
    );
  }

  async rawGet<T>(url: string): Promise<T | undefined> {
    try {
      // Canonical implementation of abortable fetch for interrupting when request takes longer than desired.
      // https://developer.chrome.com/blog/abortable-fetch/#reacting_to_an_aborted_fetch
      const controller = new AbortController();
      const signal = controller.signal;
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      const response = await fetch(url, { signal });
      // Clear timeout when response is received within the budget.
      clearTimeout(timeoutId);

      if (!response?.ok) {
        throw new HttpRequestError('Failed to fetch data', response?.status);
      }
      return await response.json();
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new HttpRequestError('Request timed out', 408, error);
      } else if (error instanceof HttpRequestError) {
        throw error;
      }

      throw new HttpRequestError('Network error', 0, error);
    }
  }

  async rawPost<T, P>(url: string, payload: P): Promise<T | undefined> {
    try {
      const controller = new AbortController();
      const signal = controller.signal;
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal,
      });

      clearTimeout(timeoutId);

      if (!response?.ok) {
        const errorBody = await response.text();
        throw new HttpRequestError(errorBody || 'Failed to post data', response?.status);
      }
      return await response.json();
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new HttpRequestError('Request timed out', 408, error);
      } else if (error instanceof HttpRequestError) {
        throw error;
      }

      throw new HttpRequestError('Network error', 0, error);
    }
  }
}
