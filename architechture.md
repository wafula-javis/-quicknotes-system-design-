QuickNotes Architecture
 
This document describes how a real QuickNotes backend could be built to serve 1 million users: what it must do, how much traffic to expect, how the parts fit together, and what we gave up to keep it simple.
 
## 1. Requirements
 
### Functional requirements (what the system does)
- A person can register and log in.
- A logged-in user can create, view (one note or a list), edit and delete their own notes.
- A note has a title (required, 1 to 100 characters) and an optional body.
- A user can tag notes and list only the notes with a given tag.
- A user can only see and change their own notes.
- New users get a welcome email.
### Non-functional requirements (how well it must do it)
- **Availability:** 99.9% uptime, which allows about 8.8 hours of downtime a year.
- **Speed:** listing notes responds in under 300 ms for 95% of requests.
- **Consistency:** after a user saves or deletes a note, their own next list must show the change.
- **Durability:** a note that was confirmed as saved is never lost (backups and a second copy of the data).
- **Scalability:** handles 1 million users, and 5 times the average load at peak, without a redesign.
- **Security:** all traffic over HTTPS, passwords stored only as hashes, every request checked against the user's token.
## 2. Load estimate for 1 million users
 
**Assumptions**
- 1,000,000 registered users, and 20% of them (200,000) use the app on a given day.
- Each active user reads notes 40 times a day (opening the list or a note) and makes 5 writes a day (create, edit or delete). 3 of those 5 writes are new notes.
- A stored note takes about 2 KB including its title, body, dates, tag links and index entries.
- Activity is spread over 24 hours (86,400 seconds). Peak traffic is 5 times the average.
- Decimal units are used (1 GB = 1,000,000 KB).
| Measure | Calculation | Result |
|---|---|---|
| Active users per day | 1,000,000 x 20% | 200,000 |
| Reads per day | 200,000 x 40 | 8,000,000 |
| Reads per second (average) | 8,000,000 / 86,400 | about 93 |
| Reads per second (peak) | 92.6 x 5 | about 463 |
| Writes per day | 200,000 x 5 | 1,000,000 |
| Writes per second (average) | 1,000,000 / 86,400 | about 11.6 |
| Writes per second (peak) | 11.57 x 5 | about 58 |
| New notes per day | 200,000 x 3 | 600,000 |
| Storage per day | 600,000 x 2 KB | about 1.2 GB |
| Storage per year | 1.2 GB x 365 | **about 438 GB** |
 
The user accounts add about 1 GB once (1,000,000 x 1 KB). With a read replica holding a second copy, the disk needed is roughly double, about 876 GB a year.
 
**What this tells us**
- The system is **read-heavy**: 8 reads for every write.
- It is also **small**. About 463 reads a second at peak and under half a terabyte a year is well within what a single database server can hold for years. The design below is therefore driven mainly by **availability and speed** (no single failure should take the service down), not by raw capacity.
- If we assume a cache answers 80% of reads, only about 93 reads a second at peak reach the database.
- If all 1 million users were active every day, the numbers would be 5 times larger: about 2,315 reads and 289 writes a second at peak, and about 2.2 TB of new data a year. The same architecture still works, with more app servers.
## 3. Architecture diagram
 
```
        +-------------------------------------------------------------------+
        |                      Client (browser or app)                      |
        +-----+-------------------------+-----------------------------+-----+
              | 1. name lookup          | 2. static files             | 3. API calls
              v                         v                             v
         +---------+               +---------+               +-----------------+
         |   DNS   |               |   CDN   |               |  Load balancer  |
         +---------+               +---------+               +--------+--------+
                         (index.html, api.js, style.css)              |
                                                          +-----------+-----------+
                                                          v                       v
                                                  +--------------+        +--------------+
                                                  | App server 1 |        | App server 2 |
                                                  +-------+------+        +-------+------+
                                                          |                       |
                                                          +-----------+-----------+
                                                                      |
                  +-----------------+-----------------------------+---+-------------+
                  v                 v                             v                 v
             +---------+    +--------------+              +--------------+     +---------+
             |  Cache  |    |  Primary DB  |  copies data | Read replica |     |  Queue  |
             +---------+    |   (writes)   |------------->|   (reads)    |     +----+----+
                            +--------------+              +--------------+          |
                                                                                    v
                                                                               +---------+
                                                                               |  Worker |
                                                                               +---------+
                                                                         (sends welcome emails)
```
 
- **Reads** go to the cache first, then to the read replica if the cache does not have the answer.
- **Writes** go to the primary database, which copies its data to the read replica.
- **Background jobs** go onto the queue and are done later by the worker.
## 4. What each component does
 
- **Client:** the browser or app that shows the notes and sends requests.
- **DNS:** it turns names like `api.quicknotes.example` into the address of the right server, so users never need to know IP addresses and we can move servers without changing the name.
- **CDN:** it keeps copies of the static files (`index.html`, `api.js`, `style.css`) on servers close to users, so the page loads quickly and our app servers are never asked for files that never change. API answers are private to each user, so the CDN does not cache them.
- **Load balancer:** it spreads incoming requests across the app servers and stops sending traffic to any server that stops responding, so no single server is overloaded or a single point of failure.
- **App servers (two or more):** they run the API logic (login, checking the token, reading and writing notes). They keep no data of their own, so we can add more of them when traffic grows.
- **Cache:** it keeps recent answers, such as a user's first page of notes, in fast memory, so the database is not asked the same question again and again.
- **Primary database:** it is the one place where all writes go, so the data stays correct and durable.
- **Read replica:** it is a live copy of the primary that answers read queries, so the many reads do not slow down the writes on the primary, and it can take over if the primary fails.
- **Queue:** it holds slow jobs, such as sending an email, so the user's request can finish straight away and a burst of jobs waits in line instead of overwhelming the system.
- **Worker:** it takes jobs from the queue and does them in the background (for example sending the welcome email after sign-up), and we can run more workers if the queue grows.
## 5. Request flows
 
### GET /notes (listing notes)
1. The client looks up `api.quicknotes.example` through DNS and gets the address of the load balancer.
2. The client sends `GET /notes` with its token over HTTPS to the load balancer.
3. The load balancer forwards the request to a healthy app server.
4. The app server checks the token. If it is missing or expired, it replies `401`.
5. The app server looks in the cache for this user's page of notes.
6. **Cache hit:** it returns the cached list. Skip to step 9.
7. **Cache miss:** it queries the read replica for the user's newest notes. (If the user saved or deleted a note in the last 5 seconds, it reads from the primary instead, so the user always sees their own change.)
8. It stores the result in the cache for 60 seconds.
9. It replies `200 OK` with the JSON list.
### POST /notes (creating a note)
1. The client looks up the name through DNS and sends `POST /notes` with its token and JSON body over HTTPS to the load balancer.
2. The load balancer forwards it to a healthy app server.
3. The app server checks the token (`401` if invalid) and checks the body: the title must be 1 to 100 characters (`400` if not).
4. The app server saves the note, and any new tags and links, to the primary database in one transaction. If the database fails, it replies `500`.
5. It deletes this user's cached lists, so the next `GET /notes` does not show stale data.
6. It replies `201 Created` with the new note and a `Location` header.
7. In the background, the primary database copies the new rows to the read replica.
The queue is not used here. Saving a note is quick, so the user waits for it. The queue is kept for slower work such as emails.
 
## 6. Trade-offs
 
1. **Read replica: speed versus freshness.** The replica takes reads off the primary and gives us a spare copy, but it can lag a moment behind, so a user could save a note and not see it on the next read. To avoid this, we read from the primary for 5 seconds after that user writes. The cost is a little extra code and some extra load on the primary.
2. **Cache: fewer database reads versus stale data.** Caching removes most repeated queries, but a cached list can be out of date and must be cleared on every write. We use a short 60-second life and clear it on writes, accepting an extra component to run and pay for.
3. **More components than the load needs: availability versus simplicity.** At about 463 reads a second, one well-sized server could cope. We still use two app servers, a replica and a queue so that one failure does not stop the service, which means more things to set up, monitor and pay for. We accept that because the non-functional requirements ask for 99.9% uptime.
4. **One primary database: simple writes versus a limit on write scaling.** All writes go to one database, which keeps the data consistent and the design easy to understand. Writes cannot be spread over several servers, but at about 58 writes a second at peak that is not a problem. If the primary fails, the replica is promoted, and because copying is not instant, the last second or so of writes could be lost.
5. **Background emails: fast sign-up versus a small delay.** The user is not kept waiting for an email to be sent, and if the email service is down the jobs wait in the queue and retry. The cost is that the email can arrive a little late, and the queue and worker are two more parts to run.
## 7. Avoiding single points of failure
 
| Component | What if it fails? | How we avoid a single point of failure |
|---|---|---|
| DNS | Nobody can find the service | Use a DNS provider that runs several name servers in different places |
| CDN | Static files do not load | A CDN has many servers around the world, and one failing does not stop the others |
| Load balancer | No requests reach the app | Run two load balancers, so the second takes over if the first fails |
| App servers | Requests fail | Run two or more identical servers in different data centers, and the load balancer skips any that fail its health check |
| Cache | Reads become slower | The cache is optional. If it is down, the app servers read from the replica, and a replicated cache can be added |
| Primary database | Writes stop | Keep the read replica ready to be promoted, and take regular backups |
| Read replica | Reads fall back to one server | Reads switch to the primary, and a new replica can be created from a backup |
| Queue | Background jobs are lost | Use a queue that stores jobs on several machines, so queued jobs survive a failure |
| Worker | Jobs pile up | Run two or more workers, so the others keep going if one fails |
 