const FileAsync = require('lowdb/adapters/FileAsync');
const low = require('lowdb');
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
            tags
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
                // const client = new Twitter(twitterConfig());
                await Promise.all(toDestroy.map(async(documentInfo) => {
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
                    const hashedTags = tags.map(tag => `#${camelcase(tag)}`).join(' ');
                    const status = `${title} ${hashedTags} ${permalink}`;
                    try {
                        const tweet = await client.post('statuses/update', {
                            status
                        });
                        await db.get('published').push({
                            ...documentInfo,
                            tweetId: tweet.id_str
                        }).write();
                        await db.get('to-publish').remove({
                            permalink
                        }).write();
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

function watchHexoDeployAfter(twitterPublish) {
    hexo.on('deployAfter', function() {
        twitterPublish();
    });
}

function watchHexoDeployAfter(twitterPublish) {
    hexo.on('deployAfter', function() {
        twitterPublish();
    });
}

function processDocument(updateDB) {
    return (document, hexoPublished) => {
        return async (document) => {
            const publishedPost = document.layout === 'post' && document.published;
            const publishedPage = document.layout !== 'post' && document.twitterAutoPublish !== false;
            const hexoPublished = publishedPost || publishedPage;
            await updateDB(document, hexoPublished);
            return document;
        }
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
        const pages = hexo.locals.get('pages');
        for (let index = 0; index < pages.length; index++) {
            const page = pages.data[index];
            await updateDocumentDB(page);
        }
    }, {
        async: true
    });
}

async function main() {
    const db = await low(adapter)
    const twitter = await setupTwitter(db);
    registerFilters(twitter.cleanToPublish, twitter.updateDB);
    watchHexoDeployAfter(twitter.publish)
}

function registerConsoleCommandPublish() {
    hexo.extend.console.register('htb-publish', 'HTB publish posts.', async () => {
        const db = await low(adapter);
        const twitter = await setupHTB(db);
        twitter.publish();
    });
}
registerConsoleCommandPublish();

main().then((res) => console.log(res)).catch(err => console.error(err))