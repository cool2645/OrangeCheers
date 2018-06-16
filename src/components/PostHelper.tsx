import honoka from 'honoka';
import React, { Component, ComponentType } from 'react';
import * as WP from 'wordpress';

import { post as config } from '../config';
import urlEncode from '../utils/url';

import { IRefreshConfig, RefreshLevel } from './Settings';

interface IQueryParams {
  per_page: number;
  categories?: number[];
  tags?: number[];
  search?: string;

  page?: number;

  after?: string;
  before?: string;
  order?: string;
}

interface IIndex {
  pages: Map<number, IPostIndex[]>;
  totalPage: number;
}

interface IPostIndex {
  slug: string;
  offset: number;
}

interface IPost extends WP.Post {
  commentCount?: number;
}

interface IPostData {
  post: IPost;
  categories?: WP.Category[];
  tags?: WP.Tag[];
  siblings?: ISiblings;
  offset?: number;
}

interface IPostsData {
  posts: IPostData[];
  totalPage: number;
}

interface ISiblings {
  prev: undefined | null | IPostData;
  next: undefined | null | IPostData;
}

interface IViewComponentProps {
  data: null | IPostData | IPostsData;

  getPostsData(params: IQueryParams, page: number, append?: boolean, callback?: (res: any) => any): void;

  getPostData(slug: string, params?: IQueryParams, offset?: number, callback?: (res: any) => any): void;
}

interface IPostHelperState {
  refreshConfig: IRefreshConfig;
  data: null | IPostData | IPostsData;
}

function withPost<P extends object>(ViewComponent: ComponentType<IViewComponentProps>) {
  return class PostHelper extends Component<P, IPostHelperState> {

    private categories: Map<number, WP.Category>;
    private tags: Map<number, WP.Tag>;
    private posts: Map<string, IPost>;
    private indexes: Map<string, IIndex>;
    private seq: number;

    public setState<K extends keyof IPostHelperState>(
      newState: ((prevState: Readonly<IPostHelperState>) =>
        (Pick<IPostHelperState, K> | IPostHelperState | null)) | (Pick<IPostHelperState, K> | IPostHelperState | null),
      seq?: number | (() => void),
      callback?: () => void
    ): void {
      if (typeof seq !== 'number') super.setState(newState, seq);
      else if (seq === this.seq) super.setState(newState, callback);
    }

    constructor(props: P) {
      super(props);
      this.categories = localStorage.categories ? JSON.parse(localStorage.categories) : {};
      this.tags = localStorage.tags ? JSON.parse(localStorage.tags) : {};
      this.posts = localStorage.posts ? JSON.parse(localStorage.posts) : {};
      this.indexes = localStorage.indexes ? JSON.parse(localStorage.indexes) : {};
      this.seq = 0;
      this.state = {
        refreshConfig: JSON.parse(localStorage.refreshConfig),
        data: null,
      };
      this.fetchCommentCounts = this.fetchCommentCounts.bind(this);
      this.fetchCommentCount = this.fetchCommentCount.bind(this);
      this.fetchTags = this.fetchTags.bind(this);
      this.fetchCategories = this.fetchCategories.bind(this);
      this.fetchPosts = this.fetchPosts.bind(this);
      this.fetchPostsFromCache = this.fetchPostsFromCache.bind(this);
      this.fetchPost = this.fetchPost.bind(this);
      this.fetchPostFromCache = this.fetchPostFromCache.bind(this);
      this.fetchSiblings = this.fetchSiblings.bind(this);
      this.getPostData = this.getPostData.bind(this);
      this.getPostsData = this.getPostsData.bind(this);
    }

    public componentDidMount() {
      const refreshConfig = JSON.parse(localStorage.refreshConfig);
      this.setState({ refreshConfig });
    }

    public componentWillUnmount() {
      localStorage.categories = JSON.stringify(this.categories);
      localStorage.tags = JSON.stringify(this.tags);
      localStorage.posts = JSON.stringify(this.posts);
      localStorage.indexes = JSON.stringify(this.indexes);
      this.seq++;
    }

    // fetch given categories
    // if no category given, fetch categories with most posts
    private fetchCategories(filter?: number[]): Promise<WP.Category[]> {
      const params = {
        per_page: 100,
        orderby: 'count',
        order: 'desc',
      };
      let cached = true;
      if (filter !== undefined) {
        const cats = [];
        for (const id of filter) {
          if (!this.categories[id]) {
            cached = false;
            cats.push(id);
          }
        }
        (params as any).include = cats.join(',');
      } else cached = false;
      if (cached && this.state.refreshConfig.categories === RefreshLevel.Cache) {
        return new Promise<WP.Category[]>((resolve) => {
          resolve(filter.map(id => this.categories[id]));
        });
      }
      return honoka.get('/categories', {
        data: params,
      })
        .then(data => {
          data.forEach((cat: WP.Category) => {
            this.categories[cat.id] = cat;
          });
          return filter.map(id => this.categories[id]);
        });
    }

    // fetch given tags
    // if no tags given, fetch tags with most posts
    private fetchTags(filter?: number[]): Promise<WP.Tag[]> {
      const params = {
        per_page: 100,
        orderby: 'count',
        order: 'desc',
      };
      let cached = true;
      if (filter !== undefined) {
        const tags = [];
        for (const id of filter) {
          if (!this.tags[id]) {
            cached = false;
            tags.push(id);
          }
        }
        (params as any).include = tags.join(',');
      } else cached = false;
      if (cached && this.state.refreshConfig.tags === RefreshLevel.Cache) {
        return new Promise<WP.Tag[]>((resolve) => {
          resolve(filter.map(id => this.tags[id]));
        });
      }
      return honoka.get('/tags', {
        data: params,
      })
        .then(data => {
          data.forEach((tag: WP.Tag) => {
            this.tags[tag.id] = tag;
          });
          return filter.map(id => this.tags[id]);
        });
    }

    // fetch given post's comment count
    // update data state of corresponding post
    private fetchCommentCount(seq: number, post: IPost): Promise<IPost> {
      if (post.commentCount !== undefined && this.state.refreshConfig.commentCounts === RefreshLevel.Cache) {
        return new Promise<IPost>((resolve) => {
          resolve(post);
        });
      }
      return fetch(honoka.defaults.baseURL + '/comments?' + urlEncode({
        post: post.id,
        per_page: 1,
      }))
        .then(response => {
          const total = +response.headers.get('x-wp-total');
          post.commentCount = total;
          this.posts[post.slug].commentCount = total;
          if ((this.state.data as IPostsData).totalPage) {
            this.setState({
              data: {
                posts: (this.state.data as IPostsData).posts.map(p =>
                  p.post.id === post.id ? {
                    post,
                    offset: p.offset,
                    siblings: p.siblings,
                    categories: p.categories,
                    tags: p.tags,
                  } : p),
                totalPage: (this.state.data as IPostsData).totalPage,
              },
            }, seq);
          } else if ((this.state.data as IPostData).post && (this.state.data as IPostData).post.slug === post.slug) {
            this.setState({
              data: {
                post,
                siblings: (this.state.data as IPostData).siblings,
                offset: (this.state.data as IPostData).offset,
                categories: (this.state.data as IPostData).categories,
                tags: (this.state.data as IPostData).tags,
              },
            }, seq);
          }
          return post;
        });
    }

    // fetch given posts' comment count
    // update data state of corresponding posts
    private fetchCommentCounts(seq: number, posts: IPost[]): Promise<IPost[]> {
      let promise = new Promise((resolve) => {
        resolve();
      });
      for (const post of posts) {
        if (post.commentCount !== undefined && this.state.refreshConfig.commentCounts === RefreshLevel.Cache) continue;
        promise = promise.then(() => this.fetchCommentCount(seq, post));
      }
      return promise.then(() =>
        posts);
    }

    // fetch post from cache
    // return post if succeed
    // return null if fail
    private fetchPostFromCache(slug: string): Promise<null | IPost> {
      if (this.state.refreshConfig.posts === RefreshLevel.Cache && this.posts[slug]) {
        return new Promise<IPost>(resolve => {
          resolve(this.posts[slug]);
        });
      }
      return new Promise<null>(resolve => {
        resolve(null);
      });
    }

    // fetch post
    private fetchPost(slug: string): Promise<IPost> {
      return honoka.get('/posts', {
        data: {
          slug,
        },
      })
        .then(data => {
          const post = data.length === 0 ? null : data[0];
          if (post === null) {
            throw new Error('404');
          }
          return post;
        })
        .then(post => {
          this.posts[post.slug] = post;
          return post;
        });
    }

    // fetch posts from cache
    // return posts if succeed
    // return null if fail
    private fetchPostsFromCache(page: number, params: IQueryParams): Promise<null | IPostsData> {
      const query = urlEncode(params);
      if (this.state.refreshConfig.indexes === RefreshLevel.Cache &&
        this.indexes[query] && this.indexes[query].pages[page]) {
        const cachedData = this.indexes[query].pages[page].map((index: IPostIndex) => {
          const post = this.posts[index.slug];
          post.offset = index.offset;
          return post;
        });
        return new Promise<IPostsData>(resolve => {
          resolve({ posts: cachedData, totalPage: this.indexes[query].totalPage });
        });
      }
      return new Promise<null>(resolve => {
        resolve(null);
      });
    }

    // fetch posts
    private fetchPosts(page: number, params: IQueryParams): Promise<IPostsData> {
      const query = urlEncode(params);
      return fetch(honoka.defaults.baseURL + '/posts?' + urlEncode(params))
        .then(response => {
          const totalPage = +response.headers.get('x-wp-totalpages');
          return response.json()
            .then((data: IPost[]) => {
              const postsData: IPostsData = { posts: [], totalPage };
              data.forEach((post: IPost, i: number) => {
                if (this.posts[post.slug]) post.commentCount = this.posts[post.slug].commentCount;
                this.posts[post.slug] = post;
                postsData.posts.push({
                  post,
                  offset: (page - 1) * config.perPage + i,
                });
              });
              if (!this.indexes[query]) this.indexes[query] = { posts: {}, totalPage: 0 };
              this.indexes[query].totalPage = totalPage;
              this.indexes[query].pages[page] = postsData.posts.map((post: IPostData) =>
                ({ slug: post.post.slug, offset: post.offset }));
              return postsData;
            });
        });
    }

    // fetch given post's siblings
    // update data state of corresponding post
    private fetchSiblings(seq: number, post: IPostData, params: IQueryParams, offset?: number): IPostData {
      const key = urlEncode(params);
      post.siblings = {
        prev: undefined,
        next: undefined,
      };
      const siblings = post.siblings;

      // has query
      if (offset !== undefined) {
        const page = Math.floor(offset / config.perPage) + 1;
        const j = offset % config.perPage;

        // has cache
        if (this.indexes[key]) {
          // need to look at previous page
          if (j === 0) {
            // no previous page, no need any more
            if (page === 1) siblings.prev = null;
            // try previous page
            else {
              const prevPage = this.indexes[key].pages[page - 1];
              if (prevPage && prevPage.length) {
                siblings.prev = { post: this.posts[prevPage[prevPage.length - 1].slug], offset: offset - 1 };
              }
            }
          }
          // need to look at next page
          if (j === config.perPage - 1) {
            // no next page, no need any more
            if (page === this.indexes[key].totalPage) siblings.next = null;
            // try next page
            else {
              const nextPage = this.indexes[key].pages[page + 1];
              if (nextPage && nextPage.length) {
                siblings.next = { post: this.posts[nextPage[0].slug], offset: offset + 1 };
              }
            }
          }
          // look at current page
          const currPage = this.indexes[key].pages[page];
          if (currPage && currPage.length) {
            siblings.prev = j > 0 ? { post: this.posts[currPage[j - 1].slug], offset: offset - 1 } : siblings.prev;
            siblings.next = j < currPage.length - 1 ? {
              post: this.posts[currPage[j + 1].slug],
              offset: offset + 1,
            } : siblings.next;
          }
        }
      }

      if (this.state.refreshConfig.siblings === RefreshLevel.Always || siblings.prev === undefined) {
        const p1 = Object.assign({}, params);
        p1.per_page = 1;
        p1.after = post.post.date;
        p1.order = 'asc';
        honoka.get('/posts', {
          data: p1,
        })
          .then(data => {
            if (!data.length) siblings.prev = null;
            else {
              this.posts[data[0].slug] = data[0];
              siblings.prev = { post: data[0] };
            }
            if ((this.state.data as IPostData).post && (this.state.data as IPostData).post.slug === post.post.slug) {
              this.setState({ data: post }, seq);
            }
          })
          .catch(err => {
            console.log(err);
          });
      }
      if (this.state.refreshConfig.siblings === RefreshLevel.Always || siblings.next === undefined) {
        const p2 = Object.assign({}, params);
        p2.per_page = 1;
        p2.before = post.post.date;
        honoka.get('/posts', {
          data: p2,
        })
          .then(data => {
            if (!data.length) siblings.next = null;
            else {
              this.posts[data[0].slug] = data[0];
              siblings.next = { post: data[0] };
            }
            if ((this.state.data as IPostData).post && (this.state.data as IPostData).post.slug === post.post.slug) {
              this.setState({ data: post }, seq);
            }
          })
          .catch(err => {
            console.log(err);
          });
      }
      if ((this.state.data as IPostData).post && (this.state.data as IPostData).post.slug === post.post.slug) {
        this.setState({ data: post }, seq);
      }
      return post;
    }

    // get posts as well as the dependencies and push them to data state
    public getPostsData(params: IQueryParams, page: number, append?: boolean, callback?: (err: any) => any) {
      if (!append) this.seq++;
      const seq = this.seq;
      this.fetchPostsFromCache(page, params)
        .then(posts => {
          if (posts === null) return this.fetchPosts(page, params);
          else {
            if (this.state.refreshConfig.indexes === RefreshLevel.Always) this.fetchPosts(page, params);
            return posts;
          }
        })
        .then(posts => {
          let cats: number[] = [];
          posts.posts.forEach((post: IPostData) => {
            cats = cats.concat(post.post.categories);
          });
          return this.fetchCategories(cats)
            .then(categories => {
              posts.posts.forEach((post: IPostData) => {
                post.categories = post.post.categories.map(id => categories[id]);
              });
            })
            .then(() => {
              let tags: number[] = [];
              posts.posts.forEach((post: IPostData) => {
                tags = tags.concat(post.post.tags);
              });
              return this.fetchTags(tags);
            })
            .then(tags => {
              posts.posts.forEach((post: IPostData) => {
                post.tags = post.post.tags.map(id => tags[id]);
              });
            })
            .then(() => {
              const ps = posts.posts;
              if (append && (this.state.data as IPostsData).posts) posts.posts = [...(this.state.data as IPostsData).posts, ...ps];
              this.setState({ data: posts }, seq, () => {
                callback(null);
                this.fetchCommentCounts(seq, ps.map(postData => postData.post));
              });
            });
        })
        .catch(err => {
          console.log(err);
          callback(err);
        });
    }

    // get post as well as the dependencies and push it to data state
    public getPostData(slug: string, params?: IQueryParams, offset?: number, callback?: (err: any) => any) {
      this.seq++;
      const seq = this.seq;
      this.fetchPostFromCache(slug)
        .then(post => {
          if (post === null) return this.fetchPost(slug);
          else {
            if (this.state.refreshConfig.posts === RefreshLevel.Always) this.fetchPost(slug);
            return post;
          }
        })
        .then(post => ({ post, offset }))
        .then((postData: IPostData) => this.fetchCategories(postData.post.categories)
          .then((categories) => {
            postData.categories = categories;
          })
          .then(() => this.fetchTags(postData.post.tags))
          .then((tags) => {
            postData.tags = tags;
          })
          .then(() => {
            this.setState({ data: postData }, seq, () => {
              callback(null);
              this.fetchCommentCount(seq, postData.post);
              if (this.state.refreshConfig.siblings !== RefreshLevel.Never) this.fetchSiblings(seq, postData, params, offset);
            });
          })
        )
        .catch(err => {
          console.log(err);
          callback(err);
        });
    }

    public render() {
      return <ViewComponent
        data={this.state.data}
        getPostData={this.getPostData}
        getPostsData={this.getPostsData}
        {...this.props}
      />;
    }
  };
}

export { IQueryParams, IPostData, IPostsData, IViewComponentProps };
export default withPost;
