import pg from "pg"

const ref = process.env.SUPABASE_PROJECT_ID
const password = process.env.SUPABASE_DB_PASSWORD

if (!ref || !password) {
  console.error("Missing SUPABASE_PROJECT_ID or SUPABASE_DB_PASSWORD")
  process.exit(1)
}

const regions = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "eu-west-1",
  "eu-west-2",
  "eu-central-1",
  "eu-central-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-south-1",
  "sa-east-1",
  "ca-central-1",
]

async function tryRegion(region, port, prefix = "aws-1") {
  const host = `${prefix}-${region}.pooler.supabase.com`
  const client = new pg.Client({
    host,
    port,
    user: `postgres.${ref}`,
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 6000,
  })
  try {
    await client.connect()
    const r = await client.query("select current_database() db, version() v")
    await client.end()
    return { ok: true, host, port, db: r.rows[0].db }
  } catch (e) {
    try { await client.end() } catch {}
    return { ok: false, host, port, err: e.message }
  }
}

let found = null
outer: for (const prefix of ["aws-1", "aws-0"]) {
  for (const region of regions) {
    const res = await tryRegion(region, 6543, prefix)
    if (res.ok) {
      found = { region, prefix, ...res }
      console.log("MATCH:", prefix, region, "->", res.host, "db:", res.db)
      break outer
    } else {
      console.log("no:", prefix, region, "-", res.err)
    }
  }
}

if (!found) {
  console.log("NO_MATCH")
  process.exit(2)
}
console.log("FOUND_REGION=" + found.region)
console.log("FOUND_PREFIX=" + found.prefix)
console.log("FOUND_HOST=" + found.host)
