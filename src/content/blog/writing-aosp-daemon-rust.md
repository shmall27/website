---
layout: ../../layouts/BlogPostLayout.astro
title: Writing an Android Daemon in Rust
date: 2024-04-03
subtitle: Creating and launching an AIDL server to respond to system services in Rust
description: In this post, we write and launch an AIDL server that can interact with other Android system services in Rust.
series: Rust in the Android Open Source Project
issue: 3
tags:
  - aosp
  - rust
  - aidl
  - daemon
---
### What is "AIDL"

AIDL stands for Android Interface Definition Language; it is Android's mechanism for doing interprocess communication (IPC). We will be writing an AIDL server to implement our daemon. This will come in handy when we want to send events from framework level system service to our "backend" code to spawn new processes. For example, the NotificationManagerService can send information about notifications to our own code that we will write in Rust.

