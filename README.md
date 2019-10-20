# root-greenlock.js

🔐 Free SSL, Free Wildcard SSL, and Fully Automated HTTPS for Node.js and Browsers, issued by Let's Encrypt v2 via ACME

Typically file propagation is faster and more reliably than DNS propagation.
Therefore, http-01 will be preferred to dns-01 except when wildcards or **private domains** are in use.

http-01 will only be supplied as a defaut if no other challenge is provided.

```
Greenlock.create
Greenlock#add
Greenlock#order... or Greenlock#issue?
Greenlock#renew... or Greenlock#issue?
Greenlock#remove
Greenlock#get
Greenlock#all
```

Better scaling

cluster lazy-load, remote management

`server identifier (for sharding, for manager)`
