const FileAsync = require('lowdb/adapters/FileAsync');
const low = require('lowdb');
const camelcase = require('camelcase');
// Initialise Low DB
const adapter = new FileAsync('htb-db.json');

async function setupHTB(db) {
    await db.defaults({
        'published': [],
        'to-destroy': [],
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
                    await db.get('to-destroy').push(published).write();
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
            const toDestroy = db.get('to-destroy').value();
            const toPublish = db.get('to-publish').value();
            try {
                // const client = new HTB(htbConfig());
                await Promise.all(toDestroy.map(async (documentInfo) => {
                    const {
                        tweetId
                    } = documentInfo;
                    try {
                        // await client.post(`statuses/destroy/${tweetId}`, {});
                        await db.get('published').remove({
                            tweetId
                        }).write();
                        await db.get('to-destroy').remove({
                            tweetId
                        }).write();
                    } catch (error) {
                        throw new Error(`id: ${tweetId}\n${JSON.stringify(error)}`);
                    }
                }));
                await Promise.all(toPublish.map(async (documentInfo) => {
                    const {
                        title,
                        tags,
                        permalink
                    } = documentInfo;
                    try{
                    console.log(documentInfo);
                    // TODO: Publish Here
                        await db.get('published').push(documentInfo).write();
                        await db.get('to-publish').remove({
                            permalink
                        }).write();
                      }
                      catch (error) {
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
        if(tagNames.includes("hackthebox") || tagNames.includes("htb"))
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
        // NOTE: Do We want to do for pages?
        // const pages = hexo.locals.get('pages');
        // for (let index = 0; index < pages.length; index++) {
        //     const page = pages.data[index];
        //     await updateDocumentDB(page);
        // }
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
