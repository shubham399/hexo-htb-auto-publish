# hexo-htb-auto-publish


This Project is based on [hexo-twitter-auto-publish](https://github.com/studioLaCosaNostra/hexo-twitter-auto-publish) to Submit Walk-through to HackTheBox.


## Installation

```
npm i hexo-htb-auto-publish
```

## Usage


set Environment Variables as

```
export HTB_EMAIL="example@example.com"
export HTB_PASSWORD="PASSWORD"
```
and

```
export HTB_TOTP_SECRET="TOTP SECRET" # This is required if TOTP is enabled.
```

after done with this.

Add `machineId:` as HTB machineId in the post header

example:
```
https://app.hackthebox.eu/machines/263 or https://www.hackthebox.eu/home/machines/profile/263
```

Here the machine Id is `263`

and add a tag of `htb` or `hackthebox`


Now when you deploy next time using
```
hexo deploy
```
it will create a `htb-db.json` and will try to submit to `hackthebox`

You can also use

```
hexo htb-publish
```

to submit without deploying.

### About htb-db.json

There are three fields in the database: published, to-publish, to-destroy.

* `published` - contains posts that are already on HackTheBox.

* `to-publish` - contains all new posts that have not yet posted on HackTheBox.
