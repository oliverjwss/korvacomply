export async function zendeskFetch<T>(
  subdomain: string,
  accessToken: string,
  pathOrUrl: string,
  init?: RequestInit
): Promise<T> {
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `https://${subdomain}.zendesk.com${pathOrUrl}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zendesk API ${pathOrUrl} failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<T>;
}

export type ZendeskTicketField = {
  id: number;
  title: string;
  raw_title?: string;
  type: string;
};

type TicketFieldsPage = {
  ticket_fields: ZendeskTicketField[];
  next_page: string | null;
};

export type ZendeskGroup = {
  id: number;
  name: string;
};

type GroupsPage = {
  groups: ZendeskGroup[];
  next_page: string | null;
};

export async function listTicketFields(
  subdomain: string,
  accessToken: string
): Promise<ZendeskTicketField[]> {
  const out: ZendeskTicketField[] = [];
  let nextUrl: string | null = "/api/v2/ticket_fields.json";
  while (nextUrl) {
    const page: TicketFieldsPage = await zendeskFetch<TicketFieldsPage>(
      subdomain,
      accessToken,
      nextUrl
    );
    out.push(...(page.ticket_fields ?? []));
    nextUrl = page.next_page;
  }
  return out;
}

export async function createTicketField(
  subdomain: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<{ ticket_field: { id: number } }> {
  return zendeskFetch(subdomain, accessToken, "/api/v2/ticket_fields.json", {
    method: "POST",
    body: JSON.stringify({ ticket_field: body }),
  });
}

export async function listGroups(
  subdomain: string,
  accessToken: string
): Promise<ZendeskGroup[]> {
  const out: ZendeskGroup[] = [];
  let nextUrl: string | null = "/api/v2/groups.json";
  while (nextUrl) {
    const page: GroupsPage = await zendeskFetch<GroupsPage>(
      subdomain,
      accessToken,
      nextUrl
    );
    out.push(...(page.groups ?? []));
    nextUrl = page.next_page;
  }
  return out;
}
