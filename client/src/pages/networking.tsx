import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Users, UserPlus, Mail, Phone, Linkedin, Building2,
  Calendar, Edit3, Trash2, Star, Clock, Search, ExternalLink,
} from "lucide-react";
import type { Contact, Job } from "@shared/schema";
import { CONTACT_TYPES } from "@shared/schema";

const TYPE_COLORS: Record<string, string> = {
  Recruiter: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300",
  "Hiring Manager": "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300",
  Referral: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  Connection: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Other: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
};

function fmtDate(s: string) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntilFollowUp(dateStr: string): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

// ─── Contact Form Dialog ────────────────────────────────────────────────────
interface ContactDialogProps {
  contact?: Contact | null;
  jobs: Job[];
  onClose: () => void;
}

const EMPTY_FORM = {
  name: "", title: "", company: "", email: "", phone: "",
  linkedinUrl: "", contactType: "Connection", jobId: "",
  lastContactDate: "", followUpDate: "", notes: "", isReferral: false,
};

function ContactDialog({ contact, jobs, onClose }: ContactDialogProps) {
  const { toast } = useToast();
  const isEdit = !!contact;
  const [form, setForm] = useState({
    name: contact?.name ?? "",
    title: contact?.title ?? "",
    company: contact?.company ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    linkedinUrl: contact?.linkedinUrl ?? "",
    contactType: contact?.contactType ?? "Connection",
    jobId: contact?.jobId?.toString() ?? "",
    lastContactDate: contact?.lastContactDate ?? "",
    followUpDate: contact?.followUpDate ?? "",
    notes: contact?.notes ?? "",
    isReferral: contact?.isReferral ?? false,
  });

  const set = (k: keyof typeof form) => (v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: (data: any) =>
      isEdit
        ? apiRequest("PATCH", `/api/contacts/${contact!.id}`, data)
        : apiRequest("POST", "/api/contacts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: isEdit ? "Contact updated" : "Contact added" });
      onClose();
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const handleSave = () => {
    if (!form.name.trim()) return toast({ title: "Name is required", variant: "destructive" });
    mutation.mutate({
      ...form,
      jobId: form.jobId ? parseInt(form.jobId) : null,
      isReferral: form.contactType === "Referral" ? true : form.isReferral,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{isEdit ? "Edit Contact" : "Add Contact"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Full Name *</Label>
              <Input value={form.name} onChange={e => set("name")(e.target.value)}
                placeholder="Jane Smith" className="h-8 text-xs" data-testid="input-contact-name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={form.contactType} onValueChange={set("contactType")}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-contact-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Job Title</Label>
              <Input value={form.title} onChange={e => set("title")(e.target.value)}
                placeholder="Senior Recruiter" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Company</Label>
              <Input value={form.company} onChange={e => set("company")(e.target.value)}
                placeholder="Acme Corp" className="h-8 text-xs" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <Input type="email" value={form.email} onChange={e => set("email")(e.target.value)}
                placeholder="jane@acme.com" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Phone</Label>
              <Input value={form.phone} onChange={e => set("phone")(e.target.value)}
                placeholder="+1 555-0100" className="h-8 text-xs" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">LinkedIn URL</Label>
            <Input value={form.linkedinUrl} onChange={e => set("linkedinUrl")(e.target.value)}
              placeholder="https://linkedin.com/in/..." className="h-8 text-xs" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Linked Job (optional)</Label>
            <Select value={form.jobId || "none"} onValueChange={v => set("jobId")(v === "none" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="No job linked" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No job linked</SelectItem>
                {jobs.slice(0, 50).map(j => (
                  <SelectItem key={j.id} value={j.id.toString()}>
                    {j.title} · {j.company}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Last Contact Date</Label>
              <Input type="date" value={form.lastContactDate} onChange={e => set("lastContactDate")(e.target.value)}
                className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Follow-up Date</Label>
              <Input type="date" value={form.followUpDate} onChange={e => set("followUpDate")(e.target.value)}
                className="h-8 text-xs" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea value={form.notes} onChange={e => set("notes")(e.target.value)}
              placeholder="How you met, topics discussed, referral details..." rows={3}
              className="text-xs" data-testid="textarea-contact-notes" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={mutation.isPending} data-testid="button-save-contact">
            {mutation.isPending ? "Saving…" : (isEdit ? "Save Changes" : "Add Contact")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function NetworkingPage() {
  const [showDialog, setShowDialog] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const { toast } = useToast();

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({ queryKey: ["/api/contacts"] });
  const { data: jobs = [] } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/contacts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact removed" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase();
    const matchesSearch = !q || [c.name, c.company, c.title, c.email].some(f => f?.toLowerCase().includes(q));
    const matchesType = filterType === "all" || c.contactType === filterType;
    return matchesSearch && matchesType;
  });

  const stats = {
    total: contacts.length,
    recruiters: contacts.filter(c => c.contactType === "Recruiter").length,
    referrals: contacts.filter(c => c.contactType === "Referral" || c.isReferral).length,
    followUpDue: contacts.filter(c => {
      if (!c.followUpDate) return false;
      const days = daysUntilFollowUp(c.followUpDate);
      return days !== null && days <= 3;
    }).length,
  };

  const jobMap = new Map(jobs.map(j => [j.id, j]));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Networking Tracker</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track recruiters, referrals, and connections throughout your job search.
          </p>
        </div>
        <Button onClick={() => { setEditContact(null); setShowDialog(true); }}
          data-testid="button-add-contact">
          <UserPlus className="h-4 w-4 mr-1.5" />
          Add Contact
        </Button>
      </div>

      {/* Stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Contacts", value: stats.total, icon: Users, color: "text-indigo-500" },
            { label: "Recruiters", value: stats.recruiters, icon: UserPlus, color: "text-blue-500" },
            { label: "Referrals", value: stats.referrals, icon: Star, color: "text-emerald-500" },
            { label: "Follow-ups Due", value: stats.followUpDue, icon: Clock, color: "text-amber-500" },
          ].map(card => (
            <Card key={card.label}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs text-muted-foreground font-medium leading-tight">{card.label}</span>
                  <card.icon className={`h-4 w-4 shrink-0 ${card.color}`} />
                </div>
                <p className="text-2xl font-bold" data-testid={`text-stat-${card.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  {card.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search contacts…"
            className="pl-8 h-8 text-xs"
            data-testid="input-search-contacts"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-filter-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {CONTACT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Contact list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
            <Users className="h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">
              {contacts.length === 0 ? "No contacts yet" : "No contacts match your filters"}
            </p>
            {contacts.length === 0 && (
              <p className="text-xs text-center max-w-xs">
                Add recruiters, referrals, and connections to keep track of your network.
              </p>
            )}
            {contacts.length === 0 && (
              <Button size="sm" onClick={() => setShowDialog(true)}>
                <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                Add your first contact
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(contact => {
            const followUpDays = daysUntilFollowUp(contact.followUpDate);
            const isFollowUpDue = followUpDays !== null && followUpDays <= 3;
            const linkedJob = contact.jobId ? jobMap.get(contact.jobId) : null;

            return (
              <Card
                key={contact.id}
                className={isFollowUpDue ? "border-amber-300 dark:border-amber-700" : ""}
                data-testid={`card-contact-${contact.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-sm font-semibold text-primary">
                      {contact.name.charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="font-semibold text-sm">{contact.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {[contact.title, contact.company].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap shrink-0">
                          {isFollowUpDue && (
                            <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-0">
                              Follow-up {followUpDays === 0 ? "today" : followUpDays! < 0 ? "overdue" : `in ${followUpDays}d`}
                            </Badge>
                          )}
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${TYPE_COLORS[contact.contactType] ?? "bg-muted text-muted-foreground"}`}>
                            {contact.contactType}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        {contact.email && (
                          <a href={`mailto:${contact.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                            <Mail className="h-3 w-3" />
                            {contact.email}
                          </a>
                        )}
                        {contact.phone && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {contact.phone}
                          </span>
                        )}
                        {contact.linkedinUrl && (
                          <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-blue-500 hover:underline">
                            <Linkedin className="h-3 w-3" />
                            LinkedIn
                          </a>
                        )}
                      </div>

                      <div className="flex items-center gap-4 mt-1.5 flex-wrap text-xs text-muted-foreground">
                        {contact.lastContactDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Last contact: {fmtDate(contact.lastContactDate)}
                          </span>
                        )}
                        {contact.followUpDate && (
                          <span className={`flex items-center gap-1 ${isFollowUpDue ? "text-amber-600 dark:text-amber-400 font-medium" : ""}`}>
                            <Clock className="h-3 w-3" />
                            Follow-up: {fmtDate(contact.followUpDate)}
                          </span>
                        )}
                        {linkedJob && (
                          <Link href={`/jobs/${linkedJob.id}`}>
                            <span className="flex items-center gap-1 cursor-pointer hover:text-foreground">
                              <Building2 className="h-3 w-3" />
                              {linkedJob.title} @ {linkedJob.company}
                              <ExternalLink className="h-2.5 w-2.5" />
                            </span>
                          </Link>
                        )}
                      </div>

                      {contact.notes && (
                        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 italic">
                          "{contact.notes}"
                        </p>
                      )}
                    </div>

                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                        onClick={() => { setEditContact(contact); setShowDialog(true); }}
                        data-testid={`button-edit-contact-${contact.id}`}>
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600"
                        onClick={() => deleteMutation.mutate(contact.id)}
                        data-testid={`button-delete-contact-${contact.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {(showDialog || editContact) && (
        <ContactDialog
          contact={editContact}
          jobs={jobs}
          onClose={() => { setShowDialog(false); setEditContact(null); }}
        />
      )}
    </div>
  );
}
