'use strict'

var bcrypt = require('bcrypt-as-promised');
var HASH_ROUNDS = 10;

class RedditAPI {
    constructor(conn) {
        this.conn = conn;
    }

    createUser(user) {
        /*
        first we have to hash the password. we will learn about hashing next week.
        the goal of hashing is to store a digested version of the password from which
        it is infeasible to recover the original password, but which can still be used
        to assess with great confidence whether a provided password is the correct one or not
         */
        return bcrypt.hash(user.password, HASH_ROUNDS)
            .then(hashedPassword => {
                return this.conn.query(
                    `
                    INSERT INTO users (username,password, createdAt, updatedAt) 
                    VALUES (?, ?, NOW(), NOW())`, 
                    [user.username, hashedPassword]);
            })
            .then(result => {
                return result.insertId;
            })
            .catch(error => {
                // Special error handling for duplicate entry
                if (error.code === 'ER_DUP_ENTRY') {
                    throw new Error('A user with this username already exists');
                }
                else {
                    throw error;
                }
            });
    }
    
    createSubreddit(subreddit) {
        return this.conn.query(
            
            `
            INSERT INTO subreddits (name, description, createdAt, updatedAt) 
            VALUES (?, ?, NOW(), NOW())`, 
            [subreddit.name, subreddit.description])
        
            .then(result => {
                return result.insertId;
            })
            .catch(error => {
                // Special error handling for duplicate entry
                if (error.code === 'ER_DUP_ENTRY') {
                    throw new Error('A subreddit with this name already exists');
                }
                else {
                    throw error;
                }
            });
    }

    createPost(post) {
        return this.conn.query(
            `
            INSERT INTO posts (userId, title, url, subredditId, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, NOW(), NOW())`,
            [post.userId, post.title, post.url, post.subredditId]
        )
            .then(result => {
                return result.insertId;
            }).catch(error => {
                if (!post.subredditId) {
                    throw new Error('No subredditId provided');
                }
                else {
                    throw error;
                }
            });
    }
    
    createVote(vote) {
        return this.conn.query(
            
            `
            INSERT INTO votes 
            SET postId = ?, userId = ?, voteDirection = ?, createdAt = NOW(), updatedAt = NOW() 
            ON DUPLICATE KEY UPDATE voteDirection = ?, updatedAt = NOW()
           `,
            [vote.postId, vote.userId, vote.voteDirection, vote.voteDirection]
            
        )
            .then(result => {
                return result.insertId;
                
            }).catch(error => {
                if (vote.voteDirection === 1 || vote.voteDirection === 0 || vote.voteDirection === -1) {
                    throw error;
                }
                else {
                    throw new Error('Invalid vote');
                }
            });
        
    }
    
    createComment(comment) {
        return this.conn.query(
            `
            INSERT INTO comments (userId, postId, parentId, text, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, NOW(), NOW())
            `,
            [comment.userId, comment.postId, comment.parentId, comment.text]
            
        )
            
        .then(result => {
                return result.insertId;
        }).catch(error => {
            throw error
            
        });
    }
        
    

    getAllPosts() {
        /*
        strings delimited with ` are an ES2015 feature called "template strings".
        they are more powerful than what we are using them for here. one feature of
        template strings is that you can write them on multiple lines. if you try to
        skip a line in a single- or double-quoted string, you would get a syntax error.
        therefore template strings make it very easy to write SQL queries that span multiple
        lines without having to manually split the string line by line.
         */
         
        return this.conn.query(
            `
            SELECT 
                SUM(v.voteDirection) AS voteScore, p.id AS post_id, p.title AS post_title, p.url AS post_url, p.userId AS post_userId, 
                p.createdAt AS post_creationDate, p.updatedAt AS post_updDate,
                u.id AS user_id, u.username AS user_username, u.createdAt AS user_creationDate, u.updatedAt AS user_updDate
            FROM posts p 
                JOIN users u ON p.userId = u.id
                JOIN subreddits s ON s.id = p.subredditId
                LEFT JOIN votes v ON p.id = v.postId
            WHERE p.subredditId = s.id
            GROUP BY post_id
            ORDER BY voteScore DESC, post_creationDate DESC
            LIMIT 25
            `
            
        ).then(result => {
            return result.map(object => {
                object.user = {
                    id: object.user_id,
                    username: object.user_username,
                    createdAt: object.user_creationDate,
                    updateAt: object.user_updDate
                }
                
                delete object.user_id;
                delete object.user_username;
                delete object.user_creationDate;
                delete object.user_updDate;
                
                return object;
            });
        })
    }
    
    getAllSubreddits() {
        return this.conn.query(
            `
            SELECT name, description 
            FROM subreddits
            ORDER BY createdAt DESC
            `
            )
    }
    
    // getAllComments(postId, levels) {
    //     var level = 0
        
    //     return this.conn.query(
    //         `
    //         SELECT id, text, createdAt, updatedAt
    //         FROM comments
    //         WHERE postId = ? AND parentId IS NULL
    //         `, [postId]
    //         )
    //         .then(result => {
    //             return result.map(object => {
    //                 var commentId = object.id;
    //                 var parentId = object.parentId;
    //                 if(level < levels) {
    //                     var replies = []
    //                     return this.conn.query(
    //                          `
    //                         SELECT reply.id, reply.text, reply.createdAt, reply.updatedAt
    //                         FROM comments c
    //                         JOIN comments reply ON c.id = reply.parentId
    //                         WHERE reply.parentId = c.?
    //                         `,[postId]
    //                         ).then(result => {
    //                             if(result.length > 0) {
    //                                 replies.push(result);
    //                                 commentId = result.id
    //                             }
    //                         })
                       
    //                 }
                    
    //                 else {
                        
    //                  }
    //             })
                
    //         })
                
    // }
    
    
    getAllComments(postId, levels) {
        return this.conn.query(
            `
            SELECT id, text, createdAt, updatedAt
            FROM comments
            WHERE postId = ? AND parentId IS NULL
            `, [postId]
            
        ).then(result => {
            console.log(result.length)
            if (result.length >0){
                return result.map(object => {
                    if (levels > 1) {
                        return getLowerComments(result.id, postId, levels); // Make this a promise, might be empty
                        }
                    })
                }
            
            else {
                return result;
                console.log(result)
            }
        });
    }
    
    
    getLowerComments(parentId, postId, levels) {
        return this.conn.query(
            `
            SELECT id, text, createdAt, updatedAt
            FROM comments
            WHERE postId = ? AND parentId = ?
            `,
            [postId, parentId]
            
        ).then(result => {
            return result.map(result => {
                levels --;
                if (levels > 0 && result.length > 0) {
                    return result.replies = getLowerComments(result.id, postId, levels); // Make this a promise, might be empty
                }
                
                else {
                    return result;
                }
            });
            
        });
    }
    
}

module.exports = RedditAPI;