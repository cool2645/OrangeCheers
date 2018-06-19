import honoka from 'honoka';
import React, { Component } from 'react';
import { Link, RouteComponentProps } from 'react-router-dom';

import { post as config } from '../config';
import '../styles/Post.css';
import '../styles/PostContent.css';
import { formatDate, human } from '../utils/datetime';

import Alert from './Alert';
import { FullPageLoader as Loader, InlineLoader } from './Loader';
import { INavControlProps } from './Nav';
import NotFound from './NotFound';
import withPost, { IPostsData, IPostData, IQueryParams, IViewComponentProps } from './PostHelper';
import { IRefreshConfig, RefreshLevel } from './Settings';

interface IQuery {
  params: IQueryParams;
}

interface IParams {
  page?: number;
  category?: string;
  tag?: string;
  search?: string;
}

interface IIndexProps extends RouteComponentProps<IParams>, IViewComponentProps, INavControlProps {
}

interface IIndexState {
  params: IParams;
  page: number;
  ready: boolean;
  query?: IQuery;
  refreshConfig?: IRefreshConfig;
  notfound: boolean;
}

const initialState: IIndexState = {
  ready: false,
  page: 1,
  params: {},
  notfound: false,
};

class Index extends Component<IIndexProps, IIndexState> {

  private unmounted: boolean;
  private readonly alert: React.RefObject<Alert>;

  public setState<K extends keyof IIndexState>(
    newState: ((prevState: Readonly<IIndexState>, props: IIndexProps) =>
      (Pick<IIndexState, K> | IIndexState | null)) | (Pick<IIndexState, K> | IIndexState | null),
    callback?: () => void
  ): void {
    if (!this.unmounted) super.setState(newState, callback);
  }

  constructor(props: IIndexProps) {
    super(props);
    const state = initialState;
    state.params = props.match.params;
    state.page = +props.match.params.page || 1;
    this.state = state;
    this.alert = React.createRef();
    this.init = this.init.bind(this);
    this.onReady = this.onReady.bind(this);
    this.onUpdated = this.onUpdated.bind(this);
    this.challengeParams = this.challengeParams.bind(this);
    this.fetchData = this.fetchData.bind(this);
  }

  public componentDidMount() {
    this.props.startProgress();
    this.unmounted = false;
    const refreshConfig = JSON.parse(localStorage.refreshConfig);
    this.setState({ refreshConfig });
    initialState.refreshConfig = refreshConfig;
    document.onreadystatechange = () => {
      if (document.readyState === 'complete') {
        if (this.state.ready) this.props.doneProgress();
        else this.props.joinProgress();
      }
    };
    this.init();
  }

  public componentWillReceiveProps(nextProps: IIndexProps) {
    const page: number = +nextProps.match.params.page || 1;
    if (page === this.state.page &&
      nextProps.match.params.category === this.state.params.category &&
      nextProps.match.params.tag === this.state.params.tag &&
      nextProps.match.params.search === this.state.params.search
    ) return;
    this.props.startProgress();
    this.setState(initialState);
    this.setState({ params: nextProps.match.params, page }, this.init);
  }

  public componentWillUnmount() {
    document.onreadystatechange = null;
    this.unmounted = true;
  }

  private onReady(error: any): void {
    if (error instanceof Error) {
      if (error.message === '404') this.setState({ notfound: true });
      else {
        this.setState({ ready: true }, () => {
          if (this.alert) {
            this.alert.current.show(
              '电波收不到喵', 'danger', null, {
                title: '重试',
                callback: error.name === 'challengeParams' ? this.init : this.fetchData,
              }
            );
          }
        });
      }
    } else this.setState({ ready: true });
    if (document.readyState === 'complete') this.props.doneProgress();
    else this.props.joinProgress();
  }

  private onUpdated(error: any): void {
    if (!this.alert) return;
    if (error instanceof Error) {
      this.alert.current.show(
        '更新出错惹', 'danger', null, {
          title: '重试',
          callback: this.fetchData,
        }
      );
    } else {
      this.alert.current.show(
        '文章列表已同步为最新', 'info', 3000
      );
    }
  }

  private init(): void {
    this.setState({ ready: false }, () =>
      this.challengeParams()
        .then(this.fetchData)
        .catch((err: Error) => {
          err.name = 'challengeParams';
          this.onReady(err);
        })
    );
  }

  private challengeParams(): Promise<void> {
    let promise = new Promise<void>((resolve) => {
      resolve();
    });
    const params: IQueryParams = {
      per_page: config.perPage,
    };
    if (this.state.params.category) {
      promise = promise.then(() => honoka.get('/categories', {
        data: {
          slug: this.state.params.category,
        },
      })
        .then(data => {
          const cat = data.length === 0 ? null : data[0];
          if (cat === null) {
            throw new Error('404');
          }
          params.categories = cat.id;
          this.props.setTyped(cat.name);
        }));
    }
    if (this.state.params.tag) {
      promise = promise.then(() => honoka.get('/tags', {
        data: {
          slug: this.state.params.tag,
        },
      })
        .then(data => {
          const tag = data.length === 0 ? null : data[0];
          if (tag === null) {
            throw new Error('404');
          }
          params.tags = tag.id;
          this.props.setTyped(tag.name);
        }));
    }
    promise = promise.then(() => {
      this.setState({ query: { params } });
    });
    return promise;
  }

  private fetchData() {
    this.props.getPostsData(
      this.state.query.params,
      this.state.page,
      false,
      this.onReady,
      this.onUpdated
    );
  }

  private renderPost(postData: IPostData) {
    const post = postData.post;
    const categories = postData.categories.map(cate =>
      <Link key={cate.slug} className="category-link"
            to={`/category/${cate.slug}`}>{cate.name}</Link>);
    const tags = postData.tags.map(tag =>
      <Link key={tag.slug} className="tag-link"
            to={`/tag/${tag.slug}`}>{tag.name}</Link>);
    let commentCount;
    if (this.state.refreshConfig.comments !== RefreshLevel.Never) {
      if (post.commentCount === undefined) {
        commentCount =
          <span className="fas fa-comments">评论数拉取中 {InlineLoader}</span>;
      } else {
        commentCount = post.commentCount === 0 ? '还没有评论耶' : post.commentCount === 1 ?
          `${post.commentCount} 条评论` : `${post.commentCount} 条评论`;
        commentCount =
          <span className="fas fa-comments"><Link to={`/${post.slug}#Comments`}>{commentCount}</Link></span>;
      }
    }
    const dateStr = formatDate(post.date_gmt + '.000Z');
    const date = [];
    date.push(<span key="date" className="fas fa-calendar">发表于 {dateStr}</span>);
    if (formatDate(post.modified_gmt + '.000Z') !== dateStr) {
      date.push(<span key="modified"
                      className="fas fa-pencil-alt">最后更新于 {human(post.modified_gmt + '.000Z')}</span>);
    }
    return (
      <div className="post">
        <Link className="post-title-link" to={{
          pathname: `/${post.slug}`,
          state: {
            params: this.state.query.params,
            offset: postData.offset,
          },
        }}>
          <h1 className="title fee page-control" dangerouslySetInnerHTML={{ __html: post.title.rendered }} />
        </Link>
        <div className="content page-control">
          <div className="post-content" dangerouslySetInnerHTML={{ __html: post.excerpt.rendered }} />
        </div>
        <div className="info eef page-control">
          {date}
          {commentCount}
          <span className="fas fa-folder">
            {categories}
          </span>
          {/*<span className="fas fa-eye" >498 Hits</span>*/}
          {
            tags.length === 0 ? '' :
              <span className="fas extra fa-tags">
              {tags}
            </span>
          }
        </div>
      </div>
    );
  }

  private renderPagination(totalPage: number) {
    if (totalPage === 1) return '';
    let slug = '';
    if (this.state.params.category) slug += `/category/${this.state.params.category}`;
    else if (this.state.params.tag) slug += `/tag/${this.state.params.tag}`;
    return (
      <div className="page-container pagination">
        <div className="nav-links">
          {
            this.state.page > 1 ?
              <Link className="prev" to={`${slug}/page/${this.state.page - 1}`}><i
                className="fas fa-chevron-left" /></Link>
              : ''
          }
          {
            this.state.page > 3 ?
              <Link className="page-number" to={`${slug}/page/1`}>1</Link>
              : ''
          }
          {
            this.state.page > 4 ?
              <span className="space">…</span>
              : ''
          }
          {
            this.state.page > 2 ?
              <Link className="page-number" to={`${slug}/page/${this.state.page - 2}`}>{this.state.page - 2}</Link>
              : ''
          }
          {
            this.state.page > 1 ?
              <Link className="page-number" to={`${slug}/page/${this.state.page - 1}`}>{this.state.page - 1}</Link>
              : ''
          }
          <span className="page-number current">{this.state.page}</span>
          {
            this.state.page < totalPage ?
              <Link className="page-number" to={`${slug}/page/${this.state.page + 1}`}>{this.state.page + 1}</Link>
              : ''
          }
          {
            this.state.page + 1 < totalPage ?
              <Link className="page-number" to={`${slug}/page/${this.state.page + 2}`}>{this.state.page + 2}</Link>
              : ''
          }
          {
            this.state.page + 3 < totalPage ?
              <span className="space">…</span>
              : ''
          }
          {
            this.state.page + 2 < totalPage ?
              <Link className="page-number" to={`${slug}/page/${totalPage}`}>{totalPage}</Link>
              : ''
          }
          {
            this.state.page < totalPage ?
              <Link className="next" to={`${slug}/page/${this.state.page + 1}`}><i
                className="fas fa-chevron-right" /></Link>
              : ''
          }
        </div>
      </div>
    );
  }

  public render() {
    if (this.state.notfound) {
      return <NotFound />;
    }
    return (
      <div className="container page">
        <Alert ref={this.alert} rootClassName="page-container" show={false} />
        {
          this.state.ready ? '' :
            <div className="page-container">
              {Loader}
            </div>
        }
        {
          this.props.data ?
            (this.props.data as IPostsData).posts.map(post =>
              <div key={post.post.id} className="page-container">
                {this.renderPost(post)}
              </div>)
            : ''
        }
        {this.props.data ? this.renderPagination((this.props.data as IPostsData).totalPage) : ''}
      </div>
    );
  }
}

export default withPost(Index);
