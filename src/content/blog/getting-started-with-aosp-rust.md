---
layout: ../../layouts/BlogPostLayout.astro
title: "Getting Started with Rust in AOSP"
date: 2024-03-27
subtitle: "Using SQLite to read the Android SMS database in Rust"
description: "In this post, we'll write an introductory AOSP module in Rust that will access and read the Android database where SMS messages are stored."
series: "Rust in the Android Open Source Project"
issue: 2
tags: ["aosp", "rust"]
---

When I started playing with the AOSP source code, I read a bunch of fragmented documentation most of which I tried unsuccessfully stringing together with ChatGPT. In fact, lots of ChatGPT's recommendations led me astray, so I wanted to share a more tutorial-style guide on doing practical things in an AOSP module.

### Hello Android

The quickest way to get started with writing an AOSP module in Rust is to create a new directory at the top level of your AOSP source code. Let's call it `hello-android`. This new directory is where your module will live. All AOSP modules require an `Android.bp` file to tell the build system how to build your module.

Inside of your `Android.bp` file, you need to define the Rust binary that we are going to build and run. Blueprint files have a json-style structure where you define the different dependencies and sources that you're building from. In the first example, we're just going to print out "Hello Android", so we will have a very simple `Android.bp` definition:

```json
rust_binary {
	name: "hello_android",
	crate_name: "hello_android",
	srcs: ["src/main.rs"],
}
```

Once we have this, we need the main.rs we reference above. Create a `src` directory, and add a `main.rs` file that looks like this:

```rust
//! Basic example of Rust in Android.

/// Prints a "Hello Android" to the terminal you call adb from.
fn main() {
    println!("Hello Android");
}
```

Some things to note: the AOSP clippy configuration requires the comments in the above code. The first line is an outer documentation comment (`//!`); it's meant to describe what the purpose of the file is. The comment above the function (`///`) is meant to document what the specific function does. When you're writing libraries, you have to add these above every public function.

The first step in getting this running on the phone is to run `m hello_android` which tells the Soong build system to build just your newly defined module. You can also cd into the directory that has your `Android.bp` file and simply run `mm` which will do the same thing. This will create an executable file inside of the out directory here: `$ANDROID_PRODUCT_OUT/system/bin/hello_android` where `ANDROID_PRODUCT_OUT` is `out/target/product/vsoc_x86_64`, assuming you're using the cuttlefish emulator.

With the executable now built on your development computer, you need to push it onto the device in order to run it. You can run `adb push "$ANDROID_PRODUCT_OUT/system/bin/hello_android" /data/local/tmp` to get the executable in a temp directory on the emulator. To call it, just run `adb shell /data/local/tmp/hello_android`. You should see "Hello Android" in the terminal.

### Using AOSP Rust Libraries

Now technically, that's an Android module written in Rust, but I want to go over an example where we pull in a library that already exists elsewhere in the AOSP. The Android build system is hermetic, ensuring that dependencies will continue working together across builds. If you attempt to bring in a new library, you have to make sure it will work with the dependency version that are already present in your build.

To check for existing libraries, you can navigate to the `external/rust/crates/` directory. This folder contains all of the imported Rust libraries that are used within the project. Rust libraries are linked dynamically by default when you're targeting a build for the emulated device. You can of course interop with C/C++ as well as Java libraries, but that will require a more dedicated post.

For fun, let's write some basic SQL using the Rusqlite crate. Navigate to `external/rust/crates/rusqlite`. As we mentioned before, all modules require an `Android.bp` file, so go to the `Android.bp` file inside of the rusqlite directory. This file tells us how we can call the library from our own module. You should see this library definition:

```rust
rust_library {
    name: "librusqlite",
    host_supported: true,
    crate_name: "rusqlite",
    cargo_env_compat: true,
    cargo_pkg_version: "0.29.0",
    srcs: ["src/lib.rs"],
    edition: "2018",
    features: [
        "modern_sqlite",
        "trace",
    ],
    rustlibs: [
        "libbitflags",
        "libfallible_iterator",
        "libfallible_streaming_iterator",
        "libhashlink",
        "liblibsqlite3_sys",
        "libsmallvec",
    ],
    apex_available: [
        "//apex_available:platform",
        "//apex_available:anyapex",
    ],
}
```

There are a few important things to note for our usage of this library. The first is the `name` attribute: "librusqlite". The second is the `crate_name`: "rusqlite". To use rusqlite in your `hello-android` module, we will need to define a Rust library in our Android.bp file:

```json
rust_library {
	name: "libdbingest",
	crate_name: "dbingest",
	srcs: ["lib/db_ingest.rs"],
	rustlibs: ["librusqlite"],
}
```

And to then use this new library in our binary:

```json
rust_binary {
	name: "hello_android",
	crate_name: "hello_android",
	srcs: ["src/main.rs"],
	rustlibs: ["libdbingest"],
}
```

Now the `crate_name` in rusqlite's `Android.bp` file comes into play when we get into importing it in our Rust code. Let's use this library to read the SMS database.

### Using Rusqlite to Read Private Databases

First, we should create a new directory inside of our `hello-android` folder and call it `lib`. `cd lib` and create a file named `db_ingest.rs`. We're going to use the rusqlite client to read the phone's SMS database.

We first import rusqlite and define the structure we want returned from the table as well as how to read the table:

```rust
//! Rust library to work with SMS messages from the Android SMS database.
use rusqlite::{params, Connection, Result};

/// Struct describing the columns to get from the SMS table.
pub struct SmsMessage {
    /// Unique id of the SMS message.
    pub id: i64,
    /// Sender or recipient of the SMS message.
    pub address: String,
    /// Date the SMS message was sent.
    pub date: i64,
    /// The contents of the sms message.
    pub body: String,
}

/// Struct to hold information about a database table to ingest.
pub struct IngestTable {
    /// Where to begin the ingest.
    pub cursor: i64,
    /// Name of the table to ingest.
    pub table_name: String,
    /// File path of the database to ingest from.
    pub database_file: String,
}
```

Note that everything that's labeled as public needs to have documentation on it according to the clippy ruleset.

Next, we define a trait pattern for structs of databases that we can ingetst:

```rust
/// Trait to describe how to ingest a database table.
pub trait DbIngestible {
    /// Get the select query for the table.
    fn select_query(table_name: &str) -> String;

    /// Create a struct from a database row.
    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self>
    where
        Self: Sized;
}
```

In the case of the `SmsMessage`, we can define its `select_query` and `from_row` functions as so:

```rust
impl DbIngestible for SmsMessage {
    fn select_query(table_name: &str, cursor: &Option<i64>) -> String {
        let mut query = format!("SELECT _id, address, date, body FROM {}", table_name);

        if let Some(cursor) = cursor {
            query.push_str(format!("  WHERE date > {}", cursor).as_str());
        }
        query
    }

    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(SmsMessage {
            id: row.get(0)?,
            address: row.get(1)?,
            date: row.get(2)?,
            body: row.get(3)?,
        })
    }
}
```

The `select_query` function is pretty straightforward; we're simply generating a string to define the column values we would like to get back. If a cursor value is passed in, we append a WHERE clause to segment the results of the SMS table.

`from_row` is also simple in that it's just defining how we can convert the row iterator into a structured format that we can use elsewhere. The indices that we pass into the `get` method correlate with the order in which they appear in our `select` statement above.

We can bring this all together in an `ingest` function defined as so:

```rust
/// Ingest database tables
pub fn ingest<T: DbIngestible>(ingest: IngestTable) -> Result<Vec<T>, Box<dyn std::error::Error>> {
    let conn = Connection::open(ingest.database_file.as_str())?;

    let select_query = T::select_query(&ingest.table_name, &ingest.cursor);
    let mut stmt = conn.prepare(&select_query)?;

    let items: Result<Vec<T>, _> = stmt.query_map([], T::from_row)?.collect();

    Ok(items?)
}
```

This is a very straightforward function that just returns the query results. I modified this for simplicity-sake from my own codebase where the function paginates and embeds various private databases, so it inherited the "ingest" namesake.

The `ingest` function is setup to accept the various parameters required for identifying the right table to read (derived from the `IngestTable` struct); this includes the database path as well as the table name. It then returns a vector of generics that implement the DbIngestible trait. For now, we only have the SmsMessage struct, but you can imagine adapting this for the Gmail or WhatsApp databases as well.

We first get a connection by passing the database's path as a `&str` to `Connection::open()`. We call our `select_query` method for the given `DbIngestible` we are passing in which returns the raw SQL string. We pass this into the `prepare` method to convert it into a properly formatted SQL query, which we then execute by calling `query_map` on the resulting `Statement` of the `prepare` method.

Finally, we execute the query with `query_map`. The empty brackets signify that we aren't passing any variables to our SQL query (these would replace "?" in the raw query string). The second parameter is a function describing how to handle an individual row. In our case, it's structuring it as a `SmsMessage` in our `from_row` implementation.

### Putting It All Together

Let's now integrate our new library with our existing `main.rs` file. Since we already defined and included the library in our `Android.bp` file, we can now simply `use` it by referencing its `crate_name` from the `rust_library` definition. Our new `src/main.rs` file will look like this:

```rust
//! Basic example of Rust in Android.
use dbingest::{ingest, IngestTable, SmsMessage};
/// Prints SMS message data from the SQLite database
fn main() {
    let ingest_table = IngestTable {
        cursor: None,
        table_name: "sms".to_string(),
        database_file: "/data/data/com.android.providers.telephony/databases/mmssms.db",
    };

	let sms_messages: Vec<SmsMessage> = ingest::<SmsMessage>(ingest_table).unwrap();

	for message in sms_messages {
		println!("{}", message.body);
	}
}
```

Remember, your SMS database is likely empty assuming you're using the emulator, so before trying to run this, you should populate it with some messages first.

Once you have some messages to test it on, you can again run `m hello_android` to build the binary. This will automatically also build its dependencies. Then `adb push "$ANDROID_PRODUCT_OUT/system/bin/hello_android" /data/local/tmp` followed by `adb shell /data/local/tmp/hello_android`. Once you run the shell command, you will likely get an error about not having the proper permission to access this database. You can run `adb root && adb remount` to restart the adb daemon with root permissions and try again after restarting the emulated device. Now you should be able to see all of the test SMS messages you've sent.
