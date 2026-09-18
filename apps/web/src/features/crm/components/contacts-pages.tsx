"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pagination } from "@/components/data-display/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableRowActions,
} from "@/components/data-display/table";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { IconMore } from "@/components/icons";
import { Dropdown, DropdownItem } from "@/components/overlays/dropdown";
import { Drawer } from "@/components/overlays/drawer";
import { ConfirmationDialog } from "@/components/overlays/modal";
import { useToast } from "@/components/overlays/toast";
import { Can } from "@/features/auth/authorization/can";
import { ForbiddenState } from "@/features/auth/components/forbidden-state";
import { isForbiddenError, isUnauthorizedError } from "@/features/auth/api/classify-auth-error";
import { isNotFoundError, queryErrorMessage } from "@/lib/api/query-error";
import {
  archiveContact,
  createContact,
  getContact,
  listCompanies,
  listContacts,
  updateContact,
} from "../api/crm-api";
import { crmKeys } from "../api/query-keys";
import type { Contact } from "../api/types";
import { formatTimestamp } from "../format";
import { ActivityFeed } from "./activity-feed";
import { NotesPanel } from "@/features/shared/components/notes-panel";
import { DocumentsPanel } from "@/features/shared/components/documents-panel";
import { ContactFields } from "./crm-forms";
import { FactList, PageHeader } from "./page-chrome";
import { ResourceQueryState } from "./resource-query-state";
import { ErrorState, LoadingState } from "@/components/data-display/data-states";

export function ContactsPage() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [drawer, setDrawer] = useState<{ mode: "create" } | { mode: "edit"; contact: Contact } | null>(null);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const router = useRouter();

  const list = useQuery({
    queryKey: crmKeys.contacts.list({ cursor, limit: 25 }),
    queryFn: () => listContacts({ cursor, limit: 25 }),
  });
  const companies = useQuery({
    queryKey: crmKeys.companies.list({ page: 1, pageSize: 100 }),
    queryFn: () => listCompanies({ page: 1, pageSize: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: (body: Parameters<typeof createContact>[0]) => createContact(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmKeys.contacts.all });
      setDrawer(null);
      pushToast({ title: "Contact created", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t create contact", description: queryErrorMessage(error), tone: "danger" }),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateContact>[1] }) => updateContact(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmKeys.contacts.all });
      setDrawer(null);
      pushToast({ title: "Contact saved", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t save contact", description: queryErrorMessage(error), tone: "danger" }),
  });
  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveContact(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmKeys.contacts.all });
      setArchiveId(null);
      pushToast({ title: "Contact archived", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t archive contact", description: queryErrorMessage(error), tone: "danger" }),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="CRM"
        title="Contacts"
        description="Cursor-paginated contact list. Search query parameters are not named on this endpoint."
        actions={
          <Can permission="crm.manage">
            <Button onClick={() => setDrawer({ mode: "create" })}>New contact</Button>
          </Can>
        }
      />

      <ResourceQueryState
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.isSuccess && list.data.items.length === 0}
        emptyTitle="No contacts"
        emptyDescription="Create a contact to attach people to companies and deals."
      >
        <Table caption="Contacts">
          <TableHead>
            <TableHeaderCell>Contact</TableHeaderCell>
            <TableHeaderCell>Email</TableHeaderCell>
            <TableHeaderCell>Company</TableHeaderCell>
            <TableHeaderCell>Created</TableHeaderCell>
            <TableHeaderCell>Actions</TableHeaderCell>
          </TableHead>
          <TableBody>
            {list.data?.items.map((contact) => (
              <TableRow key={contact.id}>
                <TableCell>
                  <Link href={`/crm/contacts/${contact.id}`} className="font-semibold hover:underline">
                    {contact.name}
                  </Link>
                </TableCell>
                <TableCell>{contact.email ?? "—"}</TableCell>
                <TableCell>
                  {contact.company ? (
                    <Link href={`/crm/companies/${contact.company.id}`} className="hover:underline">
                      {contact.company.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell mono>{formatTimestamp(contact.createdAt)}</TableCell>
                <TableRowActions>
                  <Dropdown
                    trigger={({ open, setOpen, triggerId, menuId }) => (
                      <IconButton
                        id={triggerId}
                        label={`Actions for ${contact.name}`}
                        aria-haspopup="menu"
                        aria-expanded={open}
                        aria-controls={menuId}
                        onClick={() => setOpen(!open)}
                      >
                        <IconMore size={16} />
                      </IconButton>
                    )}
                  >
                    <DropdownItem onSelect={() => router.push(`/crm/contacts/${contact.id}`)}>Open</DropdownItem>
                    <Can permission="crm.manage">
                      <DropdownItem onSelect={() => setDrawer({ mode: "edit", contact })}>Edit</DropdownItem>
                      <DropdownItem destructive onSelect={() => setArchiveId(contact.id)}>
                        Archive
                      </DropdownItem>
                    </Can>
                  </Dropdown>
                </TableRowActions>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {list.data?.nextCursor ? (
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setCursor(list.data.nextCursor ?? undefined)}>
              Next page
            </Button>
          </div>
        ) : (
          <Pagination page={1} pageCount={1} onPageChange={() => undefined} summary="End of results" />
        )}
      </ResourceQueryState>

      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer?.mode === "edit" ? "Edit contact" : "New contact"}
      >
        {drawer ? (
          <ContactFields
            contact={drawer.mode === "edit" ? drawer.contact : undefined}
            companies={companies.data?.items ?? []}
            pending={createMutation.isPending || updateMutation.isPending}
            onCancel={() => setDrawer(null)}
            onSubmit={(values) => {
              if (drawer.mode === "edit") updateMutation.mutate({ id: drawer.contact.id, body: values });
              else createMutation.mutate(values);
            }}
          />
        ) : null}
      </Drawer>

      <ConfirmationDialog
        open={archiveId !== null}
        onClose={() => setArchiveId(null)}
        onConfirm={() => archiveId && archiveMutation.mutate(archiveId)}
        title="Archive this contact?"
        description="The contact will be soft-archived."
        confirmLabel="Archive"
        destructive
        pending={archiveMutation.isPending}
      />
    </div>
  );
}

export function ContactDetailPage({ id }: { id: string }) {
  const [editing, setEditing] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const query = useQuery({
    queryKey: crmKeys.contacts.detail(id),
    queryFn: () => getContact(id),
  });
  const companies = useQuery({
    queryKey: crmKeys.companies.list({ page: 1, pageSize: 100 }),
    queryFn: () => listCompanies({ page: 1, pageSize: 100 }),
  });

  const updateMutation = useMutation({
    mutationFn: (body: Parameters<typeof updateContact>[1]) => updateContact(id, body),
    onSuccess: (contact) => {
      queryClient.setQueryData(crmKeys.contacts.detail(id), contact);
      queryClient.invalidateQueries({ queryKey: crmKeys.contacts.all });
      setEditing(false);
      pushToast({ title: "Contact saved", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t save", description: queryErrorMessage(error), tone: "danger" }),
  });
  const archiveMutation = useMutation({
    mutationFn: () => archiveContact(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmKeys.contacts.all });
      queryClient.invalidateQueries({ queryKey: crmKeys.contacts.detail(id) });
      setArchiveOpen(false);
      pushToast({ title: "Contact archived", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t archive", description: queryErrorMessage(error), tone: "danger" }),
  });

  if (query.isPending) return <LoadingState label="Loading contact" />;
  if (query.isError && (isNotFoundError(query.error) || isForbiddenError(query.error) || isUnauthorizedError(query.error))) {
    return <ForbiddenState />;
  }
  if (query.isError) return <ErrorState>{queryErrorMessage(query.error)}</ErrorState>;

  const contact = query.data;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        kicker="Contact"
        title={contact.name}
        actions={
          <Can permission="crm.manage">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button variant="destructive" onClick={() => setArchiveOpen(true)}>
              Archive
            </Button>
          </Can>
        }
      />
      <FactList
        items={[
          { label: "Email", value: contact.email ?? "—" },
          { label: "Phone", value: contact.phone ?? "—" },
          {
            label: "Company",
            value: contact.company ? (
              <Link className="hover:underline" href={`/crm/companies/${contact.company.id}`}>
                {contact.company.name}
              </Link>
            ) : (
              "—"
            ),
          },
          { label: "Created", value: formatTimestamp(contact.createdAt) },
        ]}
      />
      <section>
        <h2 className="type-section-title mb-4">Activity</h2>
        <ActivityFeed contactId={contact.id} />
      </section>
      <NotesPanel parent={{ contactId: contact.id }} />
      <DocumentsPanel parent={{ contactId: contact.id }} />
      <Drawer open={editing} onClose={() => setEditing(false)} title="Edit contact">
        <ContactFields
          contact={contact}
          companies={companies.data?.items ?? []}
          pending={updateMutation.isPending}
          onCancel={() => setEditing(false)}
          onSubmit={(values) => updateMutation.mutate(values)}
        />
      </Drawer>
      <ConfirmationDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() => archiveMutation.mutate()}
        title="Archive this contact?"
        description="The contact will be soft-archived."
        confirmLabel="Archive"
        destructive
        pending={archiveMutation.isPending}
      />
    </div>
  );
}
