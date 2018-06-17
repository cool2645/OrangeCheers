import honoka from 'honoka';
import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import * as WP from 'wordpress';

import '../styles/Post.css';
import { getElementTop } from '../utils/element';

import { ClassicalLoader as Loader } from './Loader';

interface IPost {
  date: number;
  post: WP.Post;
}

type Archive = ({ [key: string]: { [key: string]: IPost[] } });

interface IArchivesProps {
  startProgress(): void;

  joinProgress(): void;

  doneProgress(): void;
}

interface IArchivesState {
  ready: boolean;
  end: boolean;
  categories: WP.Category[] | null;
  tags: WP.Tag[] | null;
  page: number;
  posts: Archive;
}

class Archives extends Component<IArchivesProps, IArchivesState> {

  private unmounted: boolean;

  public setState<K extends keyof IArchivesState>(
    newState: ((prevState: Readonly<IArchivesState>, props: IArchivesProps) =>
      (Pick<IArchivesState, K> | IArchivesState | null)) | (Pick<IArchivesState, K> | IArchivesState | null),
    callback?: () => void
  ): void {
    if (!this.unmounted) super.setState(newState, callback);
  }

  constructor(props: IArchivesProps) {
    super(props);
    this.state = {
      ready: true,
      end: false,
      categories: null,
      tags: null,
      page: 0,
      posts: {},
    };
    this.fetchCategories = this.fetchCategories.bind(this);
    this.fetchTags = this.fetchTags.bind(this);
    this.fetchPosts = this.fetchPosts.bind(this);
    this.fetchMorePosts = this.fetchMorePosts.bind(this);
    this.update = this.update.bind(this);
  }

  public componentDidMount() {
    this.props.startProgress();
    this.fetchCategories();
    this.fetchTags();
    this.fetchMorePosts();
    window.onscroll = this.update;
    this.unmounted = false;
    if (document.readyState === 'complete') {
      this.props.doneProgress();
      return;
    }
    document.onreadystatechange = () => {
      if (document.readyState === 'complete') {
        this.props.doneProgress();
      }
    };
  }

  public componentWillUnmount() {
    window.onscroll = null;
    this.unmounted = true;
    document.onreadystatechange = null;
  }

  private fetchCategories() {
    return honoka.get('/categories', {
      data: {
        orderby: 'count',
        order: 'desc',
        per_page: 100,
      },
    })
      .then(data => {
        this.setState({ categories: data });
      });
  }

  private fetchTags() {
    return honoka.get('/tags', {
      data: {
        orderby: 'count',
        order: 'desc',
        per_page: 100,
      },
    })
      .then(data => {
        this.setState({ tags: data });
      });
  }

  private update() {
    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    const commentTop = getElementTop(document.getElementById('archive-ending'));
    // let scrollHeight = document.body.clientHeight;
    const windowHeight = (window as any).visualViewport ? (window as any).visualViewport.height : window.innerHeight + 100;
    if (!this.state.end && scrollTop + windowHeight >= commentTop) this.fetchMorePosts();
  }

  private fetchPosts(page: number): Promise<WP.Post[]> {
    return honoka.get('/posts', {
      data: {
        page,
        per_page: 15,
      },
    })
      .then(data => {
        const posts: Archive = Object.assign({}, this.state.posts);
        data.forEach((post: WP.Post) => {
          const date = new Date(post.date_gmt + '.000Z');
          if (!posts[date.getFullYear() + ' ']) posts[date.getFullYear() + ' '] = {};
          if (!posts[date.getFullYear() + ' '][date.getMonth() + ' ']) posts[date.getFullYear() + ' '][date.getMonth() + ' '] = [];
          posts[date.getFullYear() + ' '][date.getMonth() + ' '].push({ date: date.getDate(), post });
        });
        this.setState({ posts });
        return data;
      });
  }

  private fetchMorePosts() {
    if (!this.state.ready) return;
    this.setState({ ready: false }, () =>
      this.fetchPosts(this.state.page + 1)
        .then((data) => {
          this.setState({ ready: true, page: this.state.page + 1 });
          this.update();
          return data;
        })
        .catch(err => {
          console.log(err);
          this.setState({ ready: true, end: true });
        })
    );
  }

  public render() {
    return (
      <div className="container page post">
        <div className="page-container page-box">
          <div className="post">
            <div className="content fee page-control post-content">
              <h1>分类目录</h1>
              {
                this.state.categories === null ? Loader :
                  this.state.categories.map((cate) => (
                    <Link key={cate.id} className="tag" to={`/category/${cate.slug}`}>
                      {`${cate.name} (${cate.count})`}
                    </Link>
                  ))
              }
            </div>
            <div className="content fee page-control post-content">
              <h1>标签</h1>
              {
                this.state.tags === null ? Loader :
                  this.state.tags.map((tag) => (
                    <Link key={tag.id} className="tag" title={`${tag.count} 次`} to={`/tag/${tag.slug}`}>
                      {tag.name}
                    </Link>
                  ))
              }
            </div>
            <div className="content page-control post-content">
              <h1>归档文章</h1>
              {
                Object.keys(this.state.posts).map(year => (
                  <div key={year}>
                    <h2>{year} 年</h2>
                    {
                      Object.keys(this.state.posts[year]).map(month => (
                        <div key={month}>
                          <h3>{month} 月</h3>
                          {
                            this.state.posts[year][month].map((post: IPost) => (
                              <div key={post.post.id}>
                                <span>{post.date} 日：</span>
                                <Link to={`/${post.post.slug}`}>{post.post.title.rendered}</Link>
                              </div>
                            ))
                          }
                        </div>
                      ))
                    }
                  </div>
                ))
              }
              <div id="archive-ending" />
              {!this.state.ready ? Loader : ''}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default Archives;
