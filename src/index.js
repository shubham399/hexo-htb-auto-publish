const FileAsync = require('lowdb/adapters/FileAsync');
const low = require('lowdb');
const camelcase = require('camelcase');
const axios = require('axios');
// Initialise Low DB
const adapter = new FileAsync('htb-db.json');

const getAccessToken = async () => {
    var data = JSON.stringify({
        "email": process.env.HTB_EMAIL,
        "password": process.env.HTB_PASSWORD
    });

    var config = {
        method: 'post',
        url: 'https://www.hackthebox.eu/api/v4/login',
        headers: {
            'Host': 'www.hackthebox.eu',
            'Origin': 'https://app.hackthebox.eu',
            'Referer': 'https://app.hackthebox.eu/login',
            'Content-Type': 'application/json',
        },
        data: data
    };

    try {
        const response = await axios(config);
        const body = response.data.message
        if (body.is2FAEnabled) {
            throw new Error("Cannot work with 2FA Enabled Account Yet!!")
        }
        return body.access_token;
    } catch (err) {
        throw err;
    }
}

const submitWalkthrough = (access_token) => {
    return async (machine_id, link) => {
        var data = JSON.stringify({
            "machine_id": machine_id,
            "url": link,
            "language_id": 29
        });

        var config = {
            method: 'post',
            url: 'https://www.hackthebox.eu/api/v4/machine/walkthroughs/submit',
            headers: {
                'Authorization': 'Bearer ' + access_token,
                'Content-Type': 'application/json'
            },
            data: data
        };
        try {
            const response = await axios(config);
            return true;
        } catch (e) {
            console.log(machine_id, link);
            if (e.response.status == 401) // 401 as unauthenticated
                return false;
            if (e.response.status == 403) // 403 Forbidden as Already Posted (not allowed to post)
                return true;
            try {
                if (e.response.data.message == 'Walkthrough already submitted.')
                    return true;
                return false;
            } catch (er) {
                return false;
            }
        }
    }
}

async function setupHTB(db) {
    await db.defaults({
        'published': [],
        'to-publish': []
    }).write();
    return {
        async updateDB({
            title,
            permalink,
            tags,
            machineId
        }, hexoPublished) {
            await db.read();
            const published = db.get('published').find({
                permalink
            }).value();
            if (published) {
                if (!hexoPublished) {
                    await db.get('to-publish').remove({
                        permalink
                    }).write();
                }
            } else {
                if (hexoPublished) {
                    const tagNames = tags ? tags.map((tag) => tag.name || tag) : [];
                    const data = {
                        title,
                        permalink,
                        hexoPublished,
                        machineId,
                        tags: tagNames
                    };
                    const document = db.get('to-publish').find({
                        permalink
                    });
                    if (document.value()) {
                        await document.assign(data).write();
                    } else {
                        await db.get('to-publish').push(data).write();
                    }
                } else {
                    await db.get('to-publish').remove({
                        permalink
                    }).write();
                }
            }
        },
        async publish() {
            await db.read();
            const toPublish = db.get('to-publish').value();
            try {
                // const client = new HTB(htbConfig());
                const token = await getAccessToken();
                let sumbit = submitWalkthrough(token);
                await Promise.all(toPublish.map(async (documentInfo) => {
                    const {
                        title,
                        tags,
                        permalink,
                        machineId
                    } = documentInfo;
                    try {
                        if (await sumbit(machineId, permalink)) {
                            await db.get('published').push(documentInfo).write();
                            await db.get('to-publish').remove({
                                permalink
                            }).write();
                        }
                        // TODO: Publish Here

                    } catch (error) {
                        throw new Error(`${status}\n${JSON.stringify(error)}`);
                    }
                }));
            } catch (error) {
                hexo.log.error(error);
            }
        },
        async cleanToPublish() {
            await db.get('to-publish').remove().write();
        }
    }
}

function watchHexoDeployAfter(htbPublish) {
    hexo.on('deployAfter', function() {
        htbPublish();
    });
}
watchHexoDeployAfter();

function processDocument(updateDB) {
    return async (document) => {
        const publishedPost = document.layout === 'post' && document.published;
        const publishedPage = document.layout !== 'post' && document.htbAutoPublish !== false;
        const hexoPublished = publishedPost || publishedPage;
        const tags = document.tags
        const tagNames = tags ? tags.map((tag) => tag.name.toLowerCase() || tag) : [];
        if (document.machineId && (tagNames.includes("hackthebox") || tagNames.includes("htb")))
            await updateDB(document, hexoPublished);
        return document;
    }
}

async function registerFilters(cleanToPublish, updateDB) {
    const updateDocumentDB = processDocument(updateDB);
    hexo.extend.filter.register('after_post_render', updateDocumentDB, {
        async: true
    });
    hexo.extend.filter.register('after_generate', async () => {
        await cleanToPublish();
        const posts = hexo.locals.get('posts');
        for (let index = 0; index < posts.length; index++) {
            const post = posts.data[index];
            await updateDocumentDB(post);
        }
    }, {
        async: true
    });
}

async function main() {
    const db = await low(adapter)
    const htb = await setupHTB(db);
    registerFilters(htb.cleanToPublish, htb.updateDB);
    watchHexoDeployAfter(htb.publish)
}

function registerConsoleCommandPublish() {
    hexo.extend.console.register('htb-publish', 'HTB publish posts.', async () => {
        const db = await low(adapter);
        const htb = await setupHTB(db);
        htb.publish();
    });
}
registerConsoleCommandPublish();

main().then((res) => {}).catch(err => console.error(err))
