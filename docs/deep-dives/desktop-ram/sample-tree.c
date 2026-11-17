// macOS benchmark-only telemetry. No task ports, command lines, or note contents.
#include <libproc.h>
#include <sys/proc_info.h>
#include <sys/resource.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <signal.h>
#include <time.h>
#include <unistd.h>
#include <errno.h>
#include <dlfcn.h>

#define CAP 65536
static struct proc_bsdinfo rows[CAP];
static int pids[CAP], selected[CAP];
static uint64_t seen_sec[CAP], seen_usec[CAP];
static int seen_pid[CAP], seen_count;
static volatile sig_atomic_t running = 1;
static void stop(int sig) { (void)sig; running = 0; }
static double seconds(clockid_t clock) { struct timespec t; clock_gettime(clock, &t); return t.tv_sec + t.tv_nsec / 1e9; }
static int known(struct proc_bsdinfo *p) {
  for (int i = 0; i < seen_count; i++) if (seen_pid[i] == (int)p->pbi_pid &&
    seen_sec[i] == p->pbi_start_tvsec && seen_usec[i] == p->pbi_start_tvusec) return 1;
  return 0;
}
static void remember(struct proc_bsdinfo *p) {
  if (known(p)) return;
  if (seen_count >= CAP) { fprintf(stderr, "Tracked process capacity exceeded\n"); exit(2); }
  seen_pid[seen_count] = p->pbi_pid; seen_sec[seen_count] = p->pbi_start_tvsec;
  seen_usec[seen_count++] = p->pbi_start_tvusec;
}
static void json_string(const char *s) {
  putchar('"'); for (; *s; s++) { unsigned char c = *s;
    if (c == '"' || c == '\\') { putchar('\\'); putchar(c); }
    else if (c < 32) printf("\\u%04x", c); else putchar(c);
  } putchar('"');
}
int main(int argc, char **argv) {
  if (argc < 3 || argc > 4) { fprintf(stderr, "Usage: sample-tree ROOT_PID INTERVAL_MS [--responsible]\n"); return 2; }
  int root = atoi(argv[1]), interval = atoi(argv[2]);
  if (root <= 1 || interval < 20 || interval > 10000) return 2;
  // WebKit XPC processes are reparented to launchd. This private diagnostic symbol
  // is optional and never used in production. Fail if ownership cannot be verified.
  int (*responsible)(int) = argc == 4 && strcmp(argv[3], "--responsible") == 0
    ? dlsym(RTLD_DEFAULT, "responsibility_get_pid_responsible_for_pid") : NULL;
  if (argc == 4 && (!responsible || responsible(root) != root)) {
    fprintf(stderr, "Independent app responsibility unavailable; refusing a partial WebKit total\n"); return 2;
  }
  struct proc_bsdinfo initial;
  if (proc_pidinfo(root, PROC_PIDTBSDINFO, 0, &initial, sizeof(initial)) != sizeof(initial)) return 2;
  remember(&initial);
  signal(SIGTERM, stop); signal(SIGINT, stop);
  setvbuf(stdout, NULL, _IOLBF, 0);
  while (running) {
    double started = seconds(CLOCK_MONOTONIC), wall = seconds(CLOCK_REALTIME);
    int total = proc_listallpids(pids, sizeof(pids)), count = 0, complete = 1;
    if (total <= 0 || total >= CAP) { fprintf(stderr, "Process discovery failed or truncated\n"); return 2; }
    for (int i = 0; i < total; i++) {
      struct proc_bsdinfo p;
      if (proc_pidinfo(pids[i], PROC_PIDTBSDINFO, 0, &p, sizeof(p)) == sizeof(p)) {
        rows[count] = p; selected[count] = known(&p) || (responsible && responsible(p.pbi_pid) == root);
        if (selected[count]) remember(&p);
        count++;
      }
    }
    int changed;
    do { changed = 0;
      for (int i = 0; i < count; i++) if (!selected[i])
        for (int j = 0; j < count; j++) if (selected[j] && rows[i].pbi_ppid == rows[j].pbi_pid) {
          selected[i] = 1; remember(&rows[i]); changed = 1; break;
        }
    } while (changed);
    uint64_t physical = 0, rss = 0; int first = 1, alive = 0;
    printf("{\"timeMs\":%.3f,\"processes\":[", wall * 1000);
    for (int i = 0; i < count; i++) if (selected[i]) {
      struct rusage_info_v4 usage = {0}; struct proc_bsdinfo after;
      int result = proc_pid_rusage(rows[i].pbi_pid, RUSAGE_INFO_V4, (rusage_info_t *)&usage);
      int error = errno;
      int checked = proc_pidinfo(rows[i].pbi_pid, PROC_PIDTBSDINFO, 0, &after, sizeof(after));
      if (!first) putchar(','); first = 0; alive++;
      printf("{\"pid\":%u,\"ppid\":%u,\"start\":\"%llu:%llu\",\"name\":", rows[i].pbi_pid,
        rows[i].pbi_ppid, rows[i].pbi_start_tvsec, rows[i].pbi_start_tvusec);
      char executable[PROC_PIDPATHINFO_MAXSIZE] = {0};
      proc_pidpath(rows[i].pbi_pid, executable, sizeof(executable));
      const char *name = strrchr(executable, '/'); json_string(name ? name + 1 : rows[i].pbi_name);
      if (result != 0 || checked != sizeof(after) || after.pbi_start_tvsec != rows[i].pbi_start_tvsec || after.pbi_start_tvusec != rows[i].pbi_start_tvusec) {
        printf(",\"error\":%d}", error ? error : -1); complete = 0;
      } else {
        printf(",\"physical\":%llu,\"rss\":%llu,\"lifetimePeak\":%llu,\"cpuNs\":%llu}",
          usage.ri_phys_footprint, usage.ri_resident_size, usage.ri_lifetime_max_phys_footprint,
          usage.ri_user_time + usage.ri_system_time);
        physical += usage.ri_phys_footprint; rss += usage.ri_resident_size;
      }
    }
    printf("],\"complete\":%s,\"physical\":%llu,\"rss\":%llu,\"sampleMs\":%.3f}\n",
      complete ? "true" : "false", (unsigned long long)physical, (unsigned long long)rss,
      (seconds(CLOCK_MONOTONIC) - started) * 1000);
    if (!alive) break;
    double remaining = interval / 1000.0 - (seconds(CLOCK_MONOTONIC) - started);
    if (remaining > 0) { struct timespec sleep = { (time_t)remaining, (long)((remaining - (time_t)remaining) * 1e9) }; nanosleep(&sleep, NULL); }
  }
  return 0;
}
