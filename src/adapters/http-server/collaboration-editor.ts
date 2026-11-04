import {composeCausalSourceHistory} from "../../core/collaboration/model.js";
import { applySourceSplices, composeSourceSplices, rebaseSourcePair, transformSourcePosition, type SourceSplice } from "../../core/collaboration/source.js";
import { createCollaborationClient, CollaborationError, validSnapshot, type CollaborationPrincipal, type CollaborationSnapshot, type CollaborationHistory } from "./collaboration-client.js";
import { archiveCollaborationDraft, collaborationClientId, createCollaborationDraftStore, type CollaborationDraft, type CollaborationDraftStore } from "./collaboration-drafts.js";
export interface SourceIntent { before:string;after:string;operations:SourceSplice[];reason?:string }
interface EditorBinding {
  getMarkdown(): string;
  isComposing?(): boolean;
  takeCollaborativeIntent?(before:string,after:string): SourceIntent | null;
  applyCollaborativeMarkdown(value: string, presentation?: { highlight?: boolean; operationSequence?: readonly (readonly SourceSplice[])[] }): { status: "applied" | "unchanged" | "deferred" | "recovery"; reason?: string };
  setCollaborativeNewline?(value: "\n" | "\r\n" | null): void;
  collaborativeSelection?(): { anchor: number; focus: number } | null;
  setCollaborativePresence?(peers: NonNullable<CollaborationSnapshot["presence"]>): void;
  subscribeSelection?(listener: () => void): () => void;
  subscribeCompositionEnd?(listener: () => void): () => void;
  setCollaborativeHistory?(value: { undo: () => void; redo?: () => void } | null): void;
}
export interface CollaborationEditorState {
  status: "connecting" | "saved" | "saving" | "offline" | "conflict" | "readonly" | "blocked";
  dirty: boolean; canWrite: boolean; durableDraft: boolean; message?: string;
  historyNotice?: { sequence: number; text: string };
  recoveryDrafts: CollaborationDraft[];
}
function confirmation() {
  let confirm!: () => void;
  const confirmed = new Promise<void>((resolve) => { confirm = resolve; });
  return { confirmed, confirm };
}
interface Options {
  url: string; token?: string; scope: string; expectedBrainId?: string; documentId: string; editor: EditorBinding; clientId?: string;
  actor?: () => { kind: "human" | "agent"; id?: string; name?: string };
  connectionContext?: () => { tabId?: string; generation?: number };
  drafts?: CollaborationDraftStore;
  onState?: (state: CollaborationEditorState) => void;
  onRecovery?: (code: string) => void;
  onSnapshot?: (snapshot: CollaborationSnapshot, view: { body: string; pending: boolean; remote: boolean }) => void;
}
export function createCollaborationEditor(options: Options) {
  const clientId = options.clientId ?? collaborationClientId(options.scope), store = options.drafts ?? createCollaborationDraftStore();
  const openingBase = options.editor.getMarkdown();
  let body = openingBase, baseline: CollaborationSnapshot | undefined, principal: CollaborationPrincipal | undefined;
  let pendingBase=openingBase,pendingOperations:SourceSplice[]=[];
  let snapshotQueue=Promise.resolve(),reconciling=0;
  const localUndo:Array<{before:string;after:string;beforeOperations:SourceSplice[];afterOperations:SourceSplice[];operations:SourceSplice[];failure?:string}>=[],localRedo:typeof localUndo=[];
  let opened = false, disposed = false, generation = 0, loadedDraft = false, conflict = false, uncertain = false, durable = true, message: string | undefined;
  let dirtyBeforeOpen = false, openFailure: string | undefined;
  let recoveredUnconfirmed: CollaborationDraft["unconfirmed"] | undefined;
  let historyFlight: { id: string; acknowledged: boolean; promise?: Promise<void>; confirmed: Promise<void>; confirm(): void } | undefined;
  let draftTitle: string | undefined, titlePromise: Promise<void> | undefined, titleSubmitted: string | undefined;
  let presenceTimer: ReturnType<typeof setTimeout> | undefined, lastPresence: string | undefined, lastPresenceAt = 0, presenceSequence = 0;
  let renderedPresence = "";
  let timer: ReturnType<typeof setTimeout> | undefined, queued: CollaborationSnapshot | undefined;
  let flight: { id: string; submitted: string; before: CollaborationSnapshot; actor:string; operations:SourceSplice[]; finishing?:Promise<void>; reviewedContentHash?: string; reviewedTitle?: string; promise?: Promise<void>; confirmed: Promise<void>; confirm(): void } | undefined;
  let reviewedPublication: { contentHash: string; epoch: string; revision: number; body: string; title: string } | undefined;
  let deferredConfirmation: { flight: NonNullable<typeof flight>; epoch: string; revision: number } | undefined;
  const undoBodies: string[] = [], redoBodies: string[] = [];
  let recoveryDrafts: CollaborationDraft[] = [];
  let historyNotice: CollaborationEditorState["historyNotice"], historyNoticeSequence = 0;
  let state: CollaborationEditorState = { status: "connecting", dirty: false, canWrite: false, durableDraft: true, recoveryDrafts: [] };
  const bodyDirty = () => !baseline ? dirtyBeforeOpen : Boolean(pendingOperations.length) || body !== baseline.body;
  const titleDirty = () => draftTitle !== undefined && draftTitle !== baseline?.title;
  const dirty = () => bodyDirty() || titleDirty();
  const canWrite = () => principal?.role === "writer" || principal?.role === "owner" || principal?.role === "admin";
  function scope() { return { scope: options.scope, principalId: principal!.id, documentId: options.documentId, clientId }; }
  function projectedPeers() {
    if (client.state !== "ready" || !opened || !baseline || conflict || uncertain) return [];
    const actor = principal ? JSON.stringify([principal.id, clientId]) : "";
    let operations: SourceSplice[];
    try { operations = flight ? composeSourceSplices(baseline.body,[flight.operations,pendingOperations]) : pendingOperations; if(applySourceSplices(baseline.body,operations)!==body)return []; } catch { return []; }
    return (baseline.presence ?? []).filter((peer) => peer.actor !== actor && (peer.leaseExpiresAt === undefined || peer.leaseExpiresAt > Date.now())).map((peer) => {
      if (peer.anchor === undefined || peer.focus === undefined) return peer;
      if (peer.epoch !== undefined && peer.epoch !== baseline!.epoch || peer.revision !== undefined && peer.revision !== baseline!.revision) return { ...peer, anchor: undefined, focus: undefined };
      try { return { ...peer, anchor: transformSourcePosition(peer.anchor, operations, peer.anchor <= peer.focus ? "left" : "right"), focus: transformSourcePosition(peer.focus, operations, "right") }; }
      catch { return { ...peer, anchor: undefined, focus: undefined }; }
    });
  }
  function notify() {
    if (disposed) return;
    const peers = projectedPeers(), signature = JSON.stringify(peers);
    if (signature !== renderedPresence) { renderedPresence = signature; options.editor.setCollaborativePresence?.(peers); }
    state = {
      status: conflict ? "conflict" : openFailure ? "blocked" : client.state === "blocked" ? "blocked" : client.state === "connecting" || client.state === "ready" && !opened ? "connecting" : client.state !== "ready" ? "offline" : !canWrite() ? "readonly" : dirty() || flight || titlePromise || historyFlight ? "saving" : "saved",
      dirty: dirty() || Boolean(flight || titlePromise || historyFlight), canWrite: Boolean(opened && canWrite() && !conflict), durableDraft: durable, message, recoveryDrafts, historyNotice,
    };
    options.onState?.(state);
    schedulePresence();
  }
  function draftRecord(): CollaborationDraft {
    let operations:SourceSplice[]|undefined;
    try{if(!flight&&pendingBase===baseline!.body&&applySourceSplices(pendingBase,pendingOperations)===body)operations=pendingOperations}catch{}
    return { ...(operations?{operations}:{}), version: 2, ...scope(), epoch: baseline!.epoch, baseRevision: baseline!.revision, baseBody: baseline!.body, body, ...(draftTitle !== undefined ? { title: draftTitle, baseTitle: baseline!.title } : {}), updatedAt: Date.now(), ...(flight ? { unconfirmed: { operationId: flight.id, submittedBody: flight.submitted } } : historyFlight ? { unconfirmed: { operationId: historyFlight.id, submittedBody: body } } : titlePromise ? { unconfirmed: { operationId: "title-unconfirmed", submittedBody: body } } : uncertain ? { unconfirmed: recoveredUnconfirmed ?? { operationId: "unconfirmed", submittedBody: body } } : {}) };
  }
  function sameDraftVersion(a: CollaborationDraft, b: CollaborationDraft) {
    return a.body === b.body && a.title === b.title && a.baseBody === b.baseBody && a.baseTitle === b.baseTitle && a.epoch === b.epoch && a.baseRevision === b.baseRevision && JSON.stringify(a.operations??null)===JSON.stringify(b.operations??null) && JSON.stringify(a.unconfirmed ?? null) === JSON.stringify(b.unconfirmed ?? null);
  }
  function persist(): boolean {
    if (!principal || !baseline) return false;
    if (!dirty() && !flight && !titlePromise && !historyFlight && !uncertain && !conflict) {
      const result = store.remove(scope()); if (result.error) { durable = false; message = result.error; }
      return result.value;
    }
    const saved = store.save(draftRecord()); durable = saved.value; if (saved.error) message = saved.error;
    return saved.value;
  }
  function paint(value: string, highlight = false, operationSequence?:readonly (readonly SourceSplice[])[]): boolean {
    const applied = options.editor.applyCollaborativeMarkdown(value, { highlight, operationSequence });
    if (applied.status === "deferred") return false;
    if (applied.status === "recovery") { options.onRecovery?.("unproven_draft"); conflict = true; message = applied.reason ?? "The editor needs explicit recovery. Both versions are retained."; return false; }
    return true;
  }
  function publishSnapshot(snapshot: CollaborationSnapshot, remote = false) { options.onSnapshot?.(snapshot, { body, pending: dirty() || Boolean(flight || titlePromise || historyFlight), remote }); }
  async function canonicalHistory(before:CollaborationSnapshot,snapshot:CollaborationSnapshot):Promise<CollaborationHistory["operations"]> {
    if(before.epoch!==snapshot.epoch)throw new CollaborationError("epoch_changed","The document epoch changed. Review the retained draft before publishing.");
    if(snapshot.revision===before.revision){if(snapshot.body!==before.body)throw new CollaborationError("protocol","The same revision contained different source.");return []}
    const operation=snapshot.operation;
    let operations:CollaborationHistory["operations"];
    if(snapshot.revision===before.revision+1 && operation?.revision===snapshot.revision && operation.splices)operations=[{revision:snapshot.revision,actor:operation.actor??"",operationId:operation.operationId??"",splices:operation.splices,...(operation.inverseOf?{inverseOf:operation.inverseOf}:{})}];
    else {
      const result:CollaborationHistory=await client.request("history.read",{documentId:options.documentId,clientId,epoch:before.epoch,fromRevision:before.revision,toRevision:snapshot.revision});
      if(result.documentId!==options.documentId||result.epoch!==before.epoch||result.fromRevision!==before.revision||result.toRevision!==snapshot.revision||!Array.isArray(result.operations))throw new CollaborationError("protocol","The backend returned invalid source history.");
      operations=result.operations;
    }
    let canonical=before.body,revision=before.revision;
    for(const operation of operations){if(operation.revision!==++revision||!Array.isArray(operation.splices))throw new CollaborationError("history_gap","Source history is not contiguous.");canonical=applySourceSplices(canonical,operation.splices)}
    if(revision!==snapshot.revision||canonical!==snapshot.body)throw new CollaborationError("history_gap","Source history did not prove the current document. The draft is retained.");
    return operations;
  }
  function accept(snapshot:CollaborationSnapshot,own?:typeof flight):Promise<void> {
    reconciling++;
    const work=snapshotQueue.then(()=>acceptNow(snapshot,own)).catch((error)=>{
      if(!disposed){options.onRecovery?.(error instanceof CollaborationError ? error.code : "history_gap");conflict=true;message=error instanceof Error?error.message:"The exact edit history could not be verified. Review the retained draft.";if(snapshot.saved&&snapshot.documentId===options.documentId){baseline=snapshot;publishSnapshot(snapshot)}persist();notify()}
    }).finally(()=>{reconciling--;if(!disposed){notify();schedule()}});
    snapshotQueue=work;return work;
  }
  function rebasePrivateHistory(base:string,remote:SourceSplice[]){
    const canonical=applySourceSplices(base,remote);
    for(const entry of [...localUndo,...localRedo]){
      if(entry.failure)continue;
      try{
        const before=rebaseSourcePair(base,entry.beforeOperations,remote),after=rebaseSourcePair(base,entry.afterOperations,remote),transaction=rebaseSourcePair(entry.before,entry.operations,before.remote);
        const beforeBody=applySourceSplices(canonical,before.local),afterBody=applySourceSplices(canonical,after.local);
        if(applySourceSplices(beforeBody,transaction.local)!==afterBody)throw new CollaborationError("history_gap","The pending history could not be mapped exactly.");
        entry.before=beforeBody;entry.after=afterBody;entry.beforeOperations=before.local;entry.afterOperations=after.local;entry.operations=transaction.local;
      }catch(error){entry.failure=error instanceof Error?error.message:"The pending history overlaps another edit. Review the retained source."}
    }
  }
  async function acceptNow(snapshot:CollaborationSnapshot,own?:typeof flight) {
    if(disposed||snapshot.documentId!==options.documentId)return;
    if(baseline&&snapshot.epoch===baseline.epoch&&snapshot.revision<baseline.revision)return;
    if(!snapshot.saved||snapshot.conflict){options.onRecovery?.("source_changed");conflict=true;message=snapshot.conflict?.message??"The saved file changed unsafely. The local draft is retained.";persist();notify();return}
    if(baseline&&snapshot.epoch===baseline.epoch&&snapshot.revision===baseline.revision&&snapshot.body===baseline.body&&!own){baseline=snapshot;publishSnapshot(snapshot);notify();return}
    if(conflict){baseline=snapshot;persist();publishSnapshot(snapshot);notify();return}
    // Revision -1 is the initial hydration placeholder, not an observed edit
    // by another writer. Later canonical changes still receive remote feedback.
    const remote=Boolean(baseline && baseline.revision >= 0)&&!own&&(snapshot.revision!==baseline?.revision||snapshot.body!==baseline?.body||snapshot.title!==baseline?.title);
    let remoteSteps:SourceSplice[][]=[];
    const sourceBase=own?.submitted??pendingBase;
    if(!baseline||baseline.revision<0){
      if(pendingOperations.length||dirtyBeforeOpen)throw new CollaborationError("unproven_draft","Review edits made before the canonical document was opened.");
      remoteSteps=body===snapshot.body?[]:[[{start:0,deleteCount:body.length,insert:snapshot.body}]];
    }else if(baseline.epoch!==snapshot.epoch){
      if(pendingOperations.length||body!==baseline.body||body!==snapshot.body||uncertain)throw new CollaborationError("epoch_changed","The backend restarted or replaced this note. Review the retained draft before publishing.");
      remoteSteps=body===snapshot.body?[]:[[{start:0,deleteCount:body.length,insert:snapshot.body}]];
    }else{
      const history=await canonicalHistory(baseline,snapshot);
      if(disposed)return;
      if(own){
        const index=history.findIndex(operation=>operation.operationId===own.id&&operation.actor===own.actor);
        if(index<0)throw new CollaborationError("history_gap","The source history did not confirm the submitted operation.");
        const prior=composeCausalSourceHistory(own.before.body,history.slice(0,index));
        const pair=rebaseSourcePair(own.before.body,own.operations,prior);
        const ownBase=applySourceSplices(own.before.body,prior),receipt=history[index];
        if(JSON.stringify(pair.local)!==JSON.stringify(receipt.splices))throw new CollaborationError("intent_mismatch","The acknowledged operation differs from the submitted positional intent. Review its retained draft.");
        if(applySourceSplices(ownBase,receipt.splices)!==applySourceSplices(own.submitted,pair.remote))throw new CollaborationError("intent_mismatch","The acknowledged source could not be reconciled with its actual operation.");
        remoteSteps=[pair.remote,...history.slice(index+1).map(operation=>operation.splices)];
      }else remoteSteps=history.map(operation=>operation.splices);
    }
    let canonical=sourceBase,local=pendingOperations,merged=body;const optimisticSteps:SourceSplice[][]=[];
    if(!baseline||baseline.revision<0||baseline.epoch!==snapshot.epoch){canonical=snapshot.body;merged=snapshot.body;local=[];optimisticSteps.push(...remoteSteps)}
    else {
      if(applySourceSplices(sourceBase,local)!==body)throw new CollaborationError("unproven_draft","The private edit sequence does not match the visible draft. Review both versions before publishing.");
      for(const operations of remoteSteps){rebasePrivateHistory(canonical,operations);const pair=rebaseSourcePair(canonical,local,operations);canonical=applySourceSplices(canonical,operations);local=pair.local;optimisticSteps.push(pair.remote);merged=applySourceSplices(canonical,local)}
      if(canonical!==snapshot.body)throw new CollaborationError("history_gap","The exact operation history did not reach the saved source.");
    }
    if(!conflict&&!paint(merged,remote,optimisticSteps)){
      if(!conflict){queued=snapshot;if(own)deferredConfirmation={flight:own,epoch:snapshot.epoch,revision:snapshot.revision};return}
    }
    if(!snapshot.body.includes("\n"))options.editor.setCollaborativeNewline?.(snapshot.prefix?.includes("\r\n")?"\r\n":"\n");
    if(!conflict){body=merged;pendingBase=snapshot.body;pendingOperations=local}
    const previousTitle = baseline?.title;
    // The canonical title policy trims surrounding whitespace. An acknowledged
    // title matching that submitted intent is not a foreign edit. Normalize
    // only the unchanged submitted draft; later local typing stays pending.
    const acceptedSubmittedTitle = titleSubmitted !== undefined && snapshot.title === titleSubmitted.trim();
    if (acceptedSubmittedTitle && draftTitle === titleSubmitted) draftTitle = snapshot.title;
    if (draftTitle !== undefined && previousTitle !== undefined && draftTitle !== previousTitle && snapshot.title !== previousTitle && snapshot.title !== draftTitle && !acceptedSubmittedTitle) {
      conflict = true; message = "Concurrent title edits need review. The local title and saved version are retained.";
    }
    if (draftTitle === undefined || draftTitle === previousTitle) draftTitle = snapshot.title;
    baseline = snapshot;
    if (own) deferredConfirmation = undefined;
    persist(); publishSnapshot(snapshot, remote); notify();
  }
  function finish(snapshot:CollaborationSnapshot,current:NonNullable<typeof flight>):Promise<void> {
    if(current.finishing)return current.finishing;
    current.finishing=(async()=>{
      if(flight!==current)return;
      await accept(snapshot,current);
      if(deferredConfirmation?.flight===current&&!conflict){current.finishing=undefined;return}
      if(disposed||flight!==current){current.confirm();return}
      flight=undefined;uncertain=false;recoveredUnconfirmed=undefined;
      if(current.reviewedContentHash&&titleDirty()&&!conflict){
        if(snapshot.body===current.submitted&&body===current.submitted&&snapshot.title===current.before.title&&draftTitle===current.reviewedTitle)reviewedPublication={contentHash:snapshot.contentHash,epoch:snapshot.epoch,revision:snapshot.revision,body,title:draftTitle!};
        else{conflict=true;message="The saved note changed while restoring its body. Compare the latest versions before restoring its title."}
      }
      const next=queued;queued=undefined;
      if(next&&(!baseline||next.epoch!==baseline.epoch||next.revision>baseline.revision))await accept(next);
      persist();notify();current.confirm();schedule();
    })();return current.finishing;
  }
  async function send() {
    clearTimeout(timer); timer = undefined;
    if (disposed || reconciling || options.editor.isComposing?.() || flight || titlePromise || historyFlight || conflict || uncertain || !opened || !baseline || client.state !== "ready" || !canWrite() || !dirty()) { notify(); return; }
    const reviewed = reviewedPublication;
    if (reviewed && (reviewed.contentHash !== baseline.contentHash || reviewed.epoch !== baseline.epoch || reviewed.revision !== baseline.revision || reviewed.body !== body || reviewed.title !== (draftTitle ?? baseline.title))) { reviewedPublication = undefined; conflict = true; message = "The saved note or draft changed after review. Compare the latest versions before publishing."; persist(); notify(); return; }
    if (!bodyDirty() && titleDirty()) {
      recoveredUnconfirmed = undefined;
      titleSubmitted = draftTitle!; reviewedPublication = undefined;
      const before = baseline;
      titlePromise = client.request("title", { documentId: options.documentId, clientId, epoch: before.epoch, baseRevision: before.revision, title: titleSubmitted, ...(reviewed ? {expectedContentHash:reviewed.contentHash} : {}) }).then((snapshot: unknown) => {
        if (!validSnapshot(snapshot)) throw new CollaborationError("protocol", "The backend returned an invalid document snapshot.");
        return accept(snapshot);
      }).catch((error: unknown) => {
        if (disposed) return;
        conflict = true; uncertain = error instanceof CollaborationError && ["unconfirmed", "offline", "closed"].includes(error.code);
        message = error instanceof Error ? error.message : "The title was not confirmed. Its draft is retained.";
      }).finally(() => { titlePromise = undefined; titleSubmitted = undefined; persist(); notify(); schedule(); });
      persist(); notify(); await titlePromise; return;
    }
    let operations:SourceSplice[];
    try {
      operations=reviewed?[{start:0,deleteCount:baseline.body.length,insert:body}]:pendingOperations;
      if(pendingBase!==baseline.body && !reviewed || applySourceSplices(baseline.body,operations)!==body)throw new CollaborationError("unproven_draft","The pending positional edits do not match the current source. Review both versions before publishing.");
    }catch(error){options.onRecovery?.("unproven_draft");conflict=true;message=error instanceof Error?error.message:"The edit sequence could not be verified.";persist();notify();return}
    const current={...confirmation(),reviewedContentHash:reviewed?.contentHash,reviewedTitle:reviewed?.title,id:crypto.randomUUID(),actor:JSON.stringify([principal!.id,clientId]),submitted:body,before:baseline,operations:operations.map(operation=>({...operation})),promise:undefined as Promise<void>|undefined,finishing:undefined as Promise<void>|undefined};
    recoveredUnconfirmed=undefined;reviewedPublication=undefined;flight=current;pendingBase=body;pendingOperations=[];localUndo.length=0;localRedo.length=0;persist();notify();
    current.promise = client.request("edit", { documentId: options.documentId, clientId, epoch: current.before.epoch, baseRevision: current.before.revision, operationId: current.id, operations, ...(current.reviewedContentHash ? { expectedContentHash: current.reviewedContentHash } : {}) }).then((snapshot: unknown) => {
      if (!validSnapshot(snapshot)) throw new CollaborationError("protocol", "The backend returned an invalid document snapshot.");
      return finish(snapshot, current);
    }).catch(async (error: unknown) => {
      if (disposed || flight !== current) { current.confirm(); return; }
      flight = undefined;
      try{pendingOperations=composeSourceSplices(current.before.body,[current.operations,pendingOperations]);pendingBase=current.before.body}catch{conflict=true}
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unconfirmed";
      if (!current.reviewedContentHash && ["epoch_changed", "history_expired", "precondition_failed"].includes(code) && client.state === "ready") {
        try {
          const currentSnapshot: unknown = await client.request("resync", { documentId: options.documentId, clientId }); queued = undefined;
          if (validSnapshot(currentSnapshot)) { await accept(currentSnapshot); current.confirm(); schedule(); return; }
        } catch { /* Rejected operations are safe to rebase only with a confirmed snapshot. */ }
      }
      uncertain = ["unconfirmed", "offline", "closed"].includes(code);
      if(uncertain)recoveredUnconfirmed={operationId:current.id,submittedBody:current.submitted};
      conflict = true; message = error instanceof Error ? error.message : "The edit was not confirmed. The local draft is retained.";
      persist(); notify(); current.confirm();
    });
    await current.confirmed;
  }
  function schedule() { if (disposed || reconciling || timer || !dirty() || conflict || uncertain || flight || titlePromise || historyFlight || !opened || client.state !== "ready" || !canWrite()) return; timer = setTimeout(() => { void send(); }, 35); }
  async function open() {
    const session = ++generation; opened = false; openFailure = undefined; notify();
    try {
      const snapshot: unknown = await client.request("open", { documentId: options.documentId, clientId });
      if (disposed || session !== generation) return;
      if (!validSnapshot(snapshot)) throw new CollaborationError("protocol", "The backend returned an invalid document snapshot.");
      if (!loadedDraft && principal) {
        loadedDraft = true;
        const saved = store.read(scope()), others = store.list(scope());
        recoveryDrafts = others.value.filter((draft) => draft.clientId !== clientId);
        if (saved.error || others.error) { durable = false; message = saved.error ?? others.error; }
        if (saved.value) {
          const draft = saved.value; recoveredUnconfirmed = draft.unconfirmed;
          if (draft.title !== undefined && draft.title !== snapshot.title) {
            draftTitle = draft.title;
            if (draft.baseTitle !== undefined && snapshot.title !== draft.baseTitle) { conflict = true; message = "A recovered title draft conflicts with the saved title."; }
          }
          body=draft.body;pendingBase=draft.baseBody;pendingOperations=draft.operations??[];
          if(draft.unconfirmed||draft.epoch!==snapshot.epoch||!draft.operations&&draft.body!==snapshot.body){conflict=true;uncertain=Boolean(draft.unconfirmed);message="A recoverable local draft needs review before it can be published."}
          baseline={...snapshot,body:draft.baseBody,epoch:draft.epoch,revision:draft.baseRevision};
        }
      }
      opened = true; lastPresence = undefined;
      if (baseline && snapshot.epoch !== baseline.epoch && bodyDirty()) { options.onRecovery?.("epoch_mismatch"); conflict = true; message = "The backend document restarted or was replaced. Review the retained draft before publishing."; }
      if (uncertain && body !== snapshot.body) { conflict = true; message = "The last edit was not confirmed. Review the draft against the saved version."; }
      // A freshly opened editor may contain a previous document placeholder;
      // without a persisted draft, the authoritative open snapshot hydrates it.
      if (!baseline) {
        if (!dirtyBeforeOpen) {body = options.editor.getMarkdown();pendingBase=body;pendingOperations=[]}
        baseline = { ...snapshot, body: dirtyBeforeOpen ? openingBase : body, revision: -1 };
      }
      await accept(snapshot);
      if (conflict) {const shown=options.editor.getMarkdown();paint(body,false,shown===body?[]:[[{start:0,deleteCount:shown.length,insert:body}]])}
      schedule(); notify();
    } catch (error) { if (!disposed && session === generation) { opened = false; openFailure = error instanceof CollaborationError ? error.code : "open_failed"; message = error instanceof Error ? error.message : "The document could not be opened."; notify(); } }
  }
  const client = createCollaborationClient({ ...options,
    onState(connection, authenticated, error) {
      if (disposed) return;
      if (authenticated) principal = authenticated;
      if (error) message = error.message;
      if (connection === "ready") void open();
      else { opened = false; generation++; persist(); notify(); }
    },
    onSnapshot: receiveSnapshot,
  });
  function receiveSnapshot(snapshot: CollaborationSnapshot) {
      if (disposed || !opened || snapshot.documentId !== options.documentId) return;
      if (!snapshot.saved || snapshot.conflict) { accept(snapshot); return; }
      if (historyFlight && snapshot.saved && !snapshot.conflict && snapshot.operation?.operationId === historyFlight.id && snapshot.operation.actor===JSON.stringify([principal?.id,clientId])) {
        const completed = historyFlight; completed.acknowledged = true;
        void accept(snapshot).then(()=>{if(historyFlight===completed)historyFlight=undefined;persist();notify();completed.confirm();schedule()});return;
      }
      if (flight) {
        if (snapshot.operation?.operationId === flight.id && snapshot.operation.actor===flight.actor) finish(snapshot, flight);
        else if (!queued || snapshot.epoch !== queued.epoch || snapshot.revision > queued.revision) queued = snapshot;
      } else accept(snapshot);
  }

  async function historyMutation(method: "undo" | "redo") {
    if (!baseline || !opened || !canWrite() || flight || titlePromise || historyFlight || conflict || bodyDirty()) return;
    const current = { ...confirmation(), id: crypto.randomUUID(), acknowledged: false, promise: undefined as Promise<void> | undefined };
    recoveredUnconfirmed = undefined; historyFlight = current; persist(); notify();
    current.promise = client.request(method, { documentId: options.documentId, clientId, epoch: baseline.epoch, operationId: current.id }).then((snapshot: unknown) => { if (!disposed && historyFlight === current && validSnapshot(snapshot)) { current.acknowledged = true; historyFlight = undefined; return accept(snapshot); } }).catch((error: unknown) => {
      if (disposed || current.acknowledged) return;
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "history_failed";
      if (["nothing_to_undo", "nothing_to_redo"].includes(code)) return;
      if (code === "history_expired") {
        historyNotice = { sequence: ++historyNoticeSequence, text: (method === "undo" ? "Undo" : "Redo") + " history is unavailable for this editor. You can keep editing." };
        return;
      }
      uncertain = ["unconfirmed", "offline", "closed"].includes(code); conflict = true;
      message = error instanceof Error ? error.message : "History operation failed. The saved version and draft are retained.";
    }).finally(() => { if (historyFlight === current) historyFlight = undefined; current.confirm(); if (!disposed) { persist(); notify(); schedule(); } });
    await current.confirmed;
  }
  async function undo(){
    if(disposed||options.editor.isComposing?.()||conflict)return;
    if(!flight&&localUndo.length){
      const entry=localUndo.at(-1)!;
      if(entry.failure||body!==entry.after){conflict=true;message=entry.failure??"The pending Undo no longer matches this draft. Review before changing source.";persist();notify();return}
      const inverse:SourceSplice[]=[];let shift=0;
      for(const operation of entry.operations){inverse.push({start:operation.start+shift,deleteCount:operation.insert.length,insert:entry.before.slice(operation.start,operation.start+operation.deleteCount)});shift+=operation.insert.length-operation.deleteCount}
      if(body===entry.after&&paint(entry.before,false,[inverse])){localUndo.pop();localRedo.push(entry);body=entry.before;pendingOperations=entry.beforeOperations;persist();notify();schedule()}return;
    }
    if(bodyDirty()||flight){if(!await api.flush())return}
    await historyMutation("undo");
  }
  async function redo(){
    if(disposed||options.editor.isComposing?.()||conflict)return;
    const entry=localRedo.at(-1);
    if(entry&&(entry.failure||body!==entry.before)){conflict=true;message=entry.failure??"The pending Redo no longer matches this draft. Review before changing source.";persist();notify();return}
    if(entry&&!flight&&body===entry.before&&paint(entry.after,false,[entry.operations])){localRedo.pop();localUndo.push(entry);body=entry.after;pendingOperations=entry.afterOperations;persist();notify();schedule();return}
    if(bodyDirty()||flight){if(!await api.flush())return}
    await historyMutation("redo");
  }
  options.editor.setCollaborativeHistory?.({ undo: () => { void undo(); }, redo: () => { void redo(); } });
  function canonicalSelection() {
    if (!baseline || conflict || uncertain || reconciling || options.editor.isComposing?.()) return null;
    const selected = options.editor.collaborativeSelection?.();
    if (!selected || options.editor.getMarkdown() !== body) return null;
    try {
      const operations = flight ? composeSourceSplices(baseline.body,[flight.operations,pendingOperations]) : pendingOperations, inverse: SourceSplice[] = []; let shift = 0;
      if(applySourceSplices(baseline.body,operations)!==body)return null;
      for (const operation of operations) { inverse.push({ start: operation.start + shift, deleteCount: operation.insert.length, insert: baseline.body.slice(operation.start, operation.start + operation.deleteCount) }); shift += operation.insert.length - operation.deleteCount; }
      // A caret inside unpublished inserted text has no canonical character yet.
      // Its insertion boundary is nevertheless a proven editing anchor.
      const project = (position: number) => {
        try { return transformSourcePosition(position, inverse, "left"); }
        catch { const inserted = inverse.find((operation) => position > operation.start && position < operation.start + operation.deleteCount); if (!inserted) throw new Error("Unmapped selection"); return transformSourcePosition(inserted.start, inverse, "left"); }
      };
      return { anchor: project(selected.anchor), focus: project(selected.focus) };
    } catch { return null; }
  }
  function schedulePresence() {
    if (disposed || presenceTimer || !opened || client.state !== "ready" || !baseline) return;
    presenceTimer = setTimeout(() => {
      presenceTimer = undefined;
      if (disposed || !opened || client.state !== "ready" || !baseline) return;
      const selection = canonicalSelection(), epoch = baseline.epoch, baseRevision = baseline.revision;
      const signature = JSON.stringify([epoch, baseRevision, selection]);
      if (lastPresence === signature && Date.now() - lastPresenceAt < 9_000) return;
      lastPresence = signature; lastPresenceAt = Date.now();
      void client.request("presence", { documentId: options.documentId, clientId, epoch, baseRevision, presenceSequence: ++presenceSequence, activity: selection ? "editing" : "viewing", ...(selection ? { selection } : {}) }).then((snapshot: unknown) => { if (!disposed && validSnapshot(snapshot)) receiveSnapshot(snapshot); }).catch((error) => {
        lastPresence = undefined;
        if (disposed || !opened || client.state !== "ready") return;
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        if (["epoch_changed", "history_expired", "history_gap", "future_revision"].includes(code) && !flight && !historyFlight && !titlePromise) {
          void client.request("open", { documentId: options.documentId, clientId }).then((snapshot: unknown) => { if (!disposed && validSnapshot(snapshot)) accept(snapshot); }).catch(() => {});
        }
      });
    }, 80);
  }
  const heartbeat = setInterval(() => { if (!disposed) { notify(); schedulePresence(); } }, 10_000);
  const stopSelection = options.editor.subscribeSelection?.(schedulePresence);
  const stopComposition = options.editor.subscribeCompositionEnd?.(() => { api.input(options.editor.getMarkdown());if(queued&&flight){const next=queued;queued=undefined;void finish(next,flight)} });
  const api = {
    connect() { if (!disposed) client.connect(); },
    input(value:string,supplied?:SourceIntent){
      if(disposed)return;
      const captured=options.editor.takeCollaborativeIntent?.(body,value),intent=supplied??captured;
      if(value===body&&!intent?.operations.length){if(queued&&!flight){const next=queued;queued=undefined;void accept(next)}schedule();return}
      reviewedPublication=undefined;if(!opened&&!baseline)dirtyBeforeOpen=true;
      const before=body,previousOperations=pendingOperations;
      body=value;
      // A retained draft can keep changing during review, but its positional
      // history is no longer proven. Preserve the first failure and do not
      // compose later edits onto the last successfully tracked body.
      if(conflict){persist();notify();return}
      try{
        if(!intent||intent.reason||intent.before!==before||intent.after!==value||applySourceSplices(before,intent.operations)!==value)throw new CollaborationError("unproven_input",intent?.reason??"This input has no verified positional edit range. Its draft is retained for review.");
        pendingOperations=composeSourceSplices(pendingBase,[pendingOperations,intent.operations]);
        if(applySourceSplices(pendingBase,pendingOperations)!==value)throw new CollaborationError("intent_mismatch","The edit sequence did not reproduce the local draft.");
        localUndo.push({before,after:value,beforeOperations:previousOperations,afterOperations:pendingOperations,operations:intent.operations});if(localUndo.length>100)localUndo.shift();localRedo.length=0;
      }catch(error){options.onRecovery?.(error instanceof CollaborationError ? error.code : "unproven_draft");conflict=true;message=error instanceof Error?error.message:"This edit could not be mapped exactly. Its draft is retained."}
      persist();if(queued&&!flight){const next=queued;queued=undefined;void accept(next)}notify();schedule();
    },
    inputTitle(title: string) {
      if (disposed || title === draftTitle) return;
      draftTitle = title; persist(); notify(); schedule();
    },
    async flush(): Promise<boolean> {
      clearTimeout(timer); timer = undefined;
      if (disposed || options.editor.isComposing?.()) return false;
      if(reconciling)await snapshotQueue;
      if (!dirty() && !flight && !titlePromise && !historyFlight && !conflict && !uncertain) return true;
      if (!opened || client.state !== "ready" || conflict || uncertain) return false;
      for (let count = 0; count < 64 && (dirty() || flight || titlePromise || historyFlight); count++) {
        if (!canWrite() || conflict || uncertain || client.state !== "ready") return false;
        if (flight) await flight.confirmed; else if (titlePromise) await titlePromise; else if (historyFlight) await historyFlight.confirmed; else await send();
      }
      return !disposed && !dirty() && !flight && !titlePromise && !historyFlight && !conflict && !uncertain;
    },
    async setTitle(title: string): Promise<boolean> { api.inputTitle(title); return api.flush(); },
    undo, redo,
    async resolveConflict(choice: "saved" | "draft", expectedHash?: string): Promise<boolean> {
      if (!baseline || flight || titlePromise || historyFlight || disposed) return false;
      if (client.state !== "ready" || !opened) {
        client.connect();
        const deadline = Date.now() + 5_000;
        while (!disposed && client.state !== "blocked" && (client.state !== "ready" || !opened) && Date.now() < deadline) await new Promise<void>((resolve) => setTimeout(resolve, 40));
        if (disposed || client.state !== "ready" || !opened) { message = "Reconnect to the intended brain before accepting the saved version or publishing this draft."; notify(); return false; }
      }
      try {
        const current: unknown = await client.request(canWrite() ? "resync" : "open", { documentId: options.documentId, clientId });
        if (!validSnapshot(current)) return false;
        if (!current.saved || current.conflict) throw new CollaborationError("source_conflict", "A writer must resolve the external source conflict before this saved version can be loaded. Your private draft is retained.");
        baseline = current;
        if (expectedHash && expectedHash !== current.contentHash) {
          conflict = true; message = "The saved note changed after review. Compare the latest saved version before publishing.";
          persist(); publishSnapshot(current); notify(); return false;
        }
        reviewedPublication = undefined; queued = undefined; deferredConfirmation = undefined; undoBodies.length = 0; redoBodies.length = 0;localUndo.length=0;localRedo.length=0;pendingBase=current.body;pendingOperations=[]; titleSubmitted = undefined;
        if (choice === "saved") { if (!paint(current.body,false,body===current.body?[]:[[{start:0,deleteCount:body.length,insert:current.body}]])) return false; body = current.body; draftTitle = current.title; }
        else {if(!paint(body,false,[]))return false;if(body!==current.body)pendingOperations=[{start:0,deleteCount:current.body.length,insert:body}] }
        if (choice === "draft" && expectedHash && (body !== current.body || titleDirty())) reviewedPublication = { contentHash: current.contentHash, epoch: current.epoch, revision: current.revision, body, title: draftTitle ?? current.title };
        conflict = false; uncertain = false; recoveredUnconfirmed = undefined; message = undefined;
        persist(); publishSnapshot(current); notify();
        if (choice === "draft") return api.flush();
        return true;
      } catch (error) { message = error instanceof Error ? error.message : "Recovery could not reconnect to the backend."; persist(); notify(); return false; }
    },
    recoverDraft(record: CollaborationDraft) {
      if (disposed || !principal || !baseline || record.scope !== options.scope || record.principalId !== principal.id || record.documentId !== options.documentId || flight || titlePromise || historyFlight) return false;
      const previous = { body, draftTitle, conflict, uncertain, recoveredUnconfirmed, pendingBase,pendingOperations };
      if (dirty() || conflict || uncertain) {
        const current = draftRecord(), read = store.read(scope()), versions = store.list(scope());
        if (read.error || versions.error) { durable = false; message = read.error ?? versions.error; notify(); return false; }
        // Use the exact stored uncertainty receipt when it describes this live
        // version; normal draft persistence need not manufacture a new receipt.
        const retained = read.value && sameDraftVersion(read.value, current) ? read.value : current;
        let preserved = versions.value.find((version) => version.clientId.startsWith("archive:") && version.archivedFromClientId === (retained.archivedFromClientId ?? retained.clientId) && sameDraftVersion(version, retained));
        if (!preserved) {
          const archived = archiveCollaborationDraft(store, retained);
          if (!archived.value) { durable = false; message = archived.error; notify(); return false; }
          preserved = archived.value;
        }
        if (!recoveryDrafts.some((version) => version.clientId === preserved!.clientId)) recoveryDrafts = [...recoveryDrafts, preserved];
      }
      body = record.body; draftTitle = record.title ?? baseline.title; conflict = true; uncertain = Boolean(record.unconfirmed); recoveredUnconfirmed = record.unconfirmed;
      message = "Review this recovered draft against the saved version before publishing.";
      if (!persist()) {
        pendingBase=previous.pendingBase;pendingOperations=previous.pendingOperations;body = previous.body; draftTitle = previous.draftTitle; conflict = previous.conflict; uncertain = previous.uncertain; recoveredUnconfirmed = previous.recoveredUnconfirmed;
        notify(); return false;
      }
      if (!paint(body,false,previous.body===body?[]:[[{start:0,deleteCount:previous.body.length,insert:body}]])) {
        const failure = message;
        pendingBase=previous.pendingBase;pendingOperations=previous.pendingOperations;body = previous.body; draftTitle = previous.draftTitle; conflict = previous.conflict; uncertain = previous.uncertain; recoveredUnconfirmed = previous.recoveredUnconfirmed;
        persist(); message = failure; notify(); return false;
      }
      notify(); return true;
    },
    async readRetainedVersion(recovery: { recoveryId: string; baseContentHash: string; externalContentHash: string }, copy?: "base" | "external") {
      if (disposed || !opened || client.state !== "ready") throw new CollaborationError("offline", "Reconnect before reading retained versions.");
      return client.request("recovery.read", { format: "editable", documentId: options.documentId, clientId, recoveryId: recovery.recoveryId, expectedBaseHash: recovery.baseContentHash, expectedExternalHash: recovery.externalContentHash, ...(copy ? { copy } : {}) });
    },
    async restoreRetainedVersion(version: { body: string; title: string }, expectedCurrentHash: string): Promise<boolean> {
      if (!principal || !baseline || disposed || !canWrite() || typeof version.body !== "string" || typeof version.title !== "string") return false;
      if (baseline.contentHash !== expectedCurrentHash) { message = "The saved note changed after review. Compare the latest saved version before restoring."; notify(); return false; }
      const record: CollaborationDraft = { version: 2, ...scope(), epoch: baseline.epoch, baseRevision: baseline.revision, baseBody: baseline.body, baseTitle: baseline.title, body: version.body, title: version.title, updatedAt: Date.now() };
      // Recovery adoption archives unique current work before it changes either
      // the private draft or the visible editor. A failed write leaves it intact.
      if (!api.recoverDraft(record)) return false;
      return api.resolveConflict("draft", expectedCurrentHash);
    },
    get body() { return body; }, get title() { return draftTitle ?? baseline?.title; }, get state() { return state; }, get snapshot() { return baseline; }, get clientId() { return clientId; },
    dispose() { if (disposed) return; persist(); disposed = true; flight?.confirm(); historyFlight?.confirm(); generation++; clearTimeout(timer); clearTimeout(presenceTimer); clearInterval(heartbeat); stopSelection?.(); options.editor.setCollaborativePresence?.([]); stopComposition?.(); options.editor.setCollaborativeHistory?.(null); client.dispose(); },
  };
  return api;
}
