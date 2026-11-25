import { DOMParser, type Element } from '@xmldom/xmldom';

import { ApiError } from '@/api/error';
import type { Task, TaskList } from '@/api/types';
import { parseVtodo } from './vtodo';

export const DAV_NS = 'DAV:';
export const CALDAV_NS = 'urn:ietf:params:xml:ns:caldav';

function readXml(xml: string) {
  try {
    return new DOMParser({ onError: (level, message) => {
      if (level !== 'warning') throw new Error(message);
    } }).parseFromString(xml, 'application/xml');
  } catch (error) {
    throw new ApiError(502, 'The server returned invalid WebDAV XML.', error);
  }
}

function text(element: Element | null | undefined) {
  return element?.textContent?.trim() || null;
}

function responses(xml: string) {
  const root = readXml(xml).documentElement;
  if (root?.namespaceURI !== DAV_NS || root.localName !== 'multistatus') {
    throw new ApiError(502, 'The server did not return a WebDAV multistatus response.');
  }
  return Array.from(root.getElementsByTagNameNS(DAV_NS, 'response'));
}

function property(response: Element, namespace: string, name: string) {
  for (const status of Array.from(response.getElementsByTagNameNS(DAV_NS, 'propstat'))) {
    if (!/^HTTP\/\S+ 2\d\d\b/.test(text(status.getElementsByTagNameNS(DAV_NS, 'status').item(0)) ?? '')) continue;
    const prop = status.getElementsByTagNameNS(DAV_NS, 'prop').item(0);
    const value = prop?.getElementsByTagNameNS(namespace, name).item(0);
    if (value) return value;
  }
  return null;
}

export function parseCalendarList(xml: string): TaskList[] {
  return responses(xml).flatMap((response) => {
    const href = text(response.getElementsByTagNameNS(DAV_NS, 'href').item(0));
    const name = text(property(response, DAV_NS, 'displayname'));
    const resourceType = property(response, DAV_NS, 'resourcetype');
    if (!href || !name || !resourceType?.getElementsByTagNameNS(CALDAV_NS, 'calendar').length) return [];
    const components = property(response, CALDAV_NS, 'supported-calendar-component-set');
    const supported = Array.from(components?.getElementsByTagNameNS(CALDAV_NS, 'comp') ?? [])
      .flatMap((component) => {
        const name = component.getAttribute('name');
        return name ? [name.toUpperCase()] : [];
      });
    return [{
      id: href.replace(/\/+$/, '').split('/').pop() ?? href,
      href,
      name,
      is_deck: name.trim().toLowerCase().startsWith('deck:') || href.toLowerCase().includes('/deck'),
      supported_components: supported,
    }];
  });
}

export function parseTaskReport(xml: string, calendar: TaskList, toAbsolute: (href: string) => string): Task[] {
  return responses(xml).flatMap((response) => {
    const href = text(response.getElementsByTagNameNS(DAV_NS, 'href').item(0));
    const etag = text(property(response, DAV_NS, 'getetag'));
    const calendarData = text(property(response, CALDAV_NS, 'calendar-data'));
    if (!href || !calendarData) return [];
    const task = parseVtodo(calendarData, toAbsolute(href), etag, calendar);
    return task ? [task] : [];
  });
}

export function readDavPrincipal(xml: string) {
  for (const response of responses(xml)) {
    const principal = property(response, DAV_NS, 'current-user-principal');
    const href = text(principal?.getElementsByTagNameNS(DAV_NS, 'href').item(0));
    if (href) return href;
  }
  return null;
}

export function readDavProperty(xml: string, namespace: string, name: string) {
  for (const response of responses(xml)) {
    const value = text(property(response, namespace, name));
    if (value) return value;
  }
  return null;
}

export function readDavHome(xml: string) {
  for (const response of responses(xml)) {
    const home = property(response, CALDAV_NS, 'calendar-home-set');
    const href = text(home?.getElementsByTagNameNS(DAV_NS, 'href')[0]);
    if (href) return href;
  }
  return null;
}
