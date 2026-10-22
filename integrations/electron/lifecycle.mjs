// Testable save-before-stop policy. Window closure is separate from application quit.
export function createQuitFlow({ getHost, control, closeWindows, cancelClose, flush, beforeStop = async () => {}, exit, showError }) {
  let pending = null;
  return () => pending ??= (async () => {
    const host = getHost();
    let lease;
    try {
      if (host?.isAlive()) {
        const result = await control(host.connection, 'shutdown', { action: 'prepare' });
        if (typeof result.id !== 'string' || !result.id) throw new Error('The local service did not confirm a safe shutdown.');
        lease = result.id;
      }
      if (!await closeWindows()) {
        if (lease) await control(host.connection, 'shutdown', { action: 'cancel', id: lease });
        cancelClose(); return;
      }
      await flush();
      // A slow unload dialog may outlive the preparation lease. Revalidate and
      // hold admission closed before stopping; never assume a stale save barrier.
      if (lease) await control(host.connection, 'shutdown', { action: 'commit', id: lease });
      await beforeStop();
      await host?.stop();
      exit();
    } catch (error) {
      if (lease && host?.isAlive()) await control(host.connection, 'shutdown', { action: 'cancel', id: lease }).catch(() => {});
      cancelClose(); await showError(error);
    } finally { pending = null; }
  })();
}
