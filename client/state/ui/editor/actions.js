/** @format */

/**
 * External dependencies
 */

import { filter } from 'lodash';

/**
 * Internal dependencies
 */
import wpcom from 'lib/wp';
import versionCompare from 'lib/version-compare';
import {
	EDITOR_AUTOSAVE,
	EDITOR_AUTOSAVE_RESET,
	EDITOR_AUTOSAVE_SUCCESS,
	EDITOR_AUTOSAVE_FAILURE,
	EDITOR_PASTE_EVENT,
	EDITOR_START,
	EDITOR_STOP,
} from 'state/action-types';
import { ModalViews } from 'state/ui/media-modal/constants';
import { setMediaModalView } from 'state/ui/media-modal/actions';
import { withAnalytics, bumpStat, recordTracksEvent } from 'state/analytics/actions';
import { savePreference } from 'state/preferences/actions';
import { getPreference } from 'state/preferences/selectors';
import { getSelectedSite } from 'state/ui/selectors';

/**
 * Constants
 */
export const MODAL_VIEW_STATS = {
	[ ModalViews.LIST ]: 'view_list',
	[ ModalViews.DETAIL ]: 'view_detail',
	[ ModalViews.GALLERY ]: 'view_gallery',
	[ ModalViews.IMAGE_EDITOR ]: 'view_edit',
	[ ModalViews.VIDEO_EDITOR ]: 'view_edit',
};

/**
 * Returns an action object to be used in signalling that the editor should
 * begin to edit the post with the specified post ID, or `null` as a new post.
 *
 * @param  {Number}  siteId   Site ID
 * @param  {?Number} postId   Post ID
 * @param  {String}  postType Post Type
 * @return {Object}           Action object
 */
export function startEditingPost( siteId, postId, postType = 'post' ) {
	return {
		type: EDITOR_START,
		siteId,
		postId,
		postType,
	};
}

/**
 * Returns an action object to be used in signalling that the editor should
 * stop editing.
 *
 * @param  {Number}  siteId Site ID
 * @param  {?Number} postId Post ID
 * @return {Object}         Action object
 */
export function stopEditingPost( siteId, postId ) {
	return {
		type: EDITOR_STOP,
		siteId,
		postId,
	};
}

/**
 * Returns an action object to be used in signalling that the user has pasted
 * some content from source.
 *
 * @param {String} source Identifier of the app the content was pasted from.
 * @return {Object} Action object
 */
export function pasteEvent( source ) {
	return {
		type: EDITOR_PASTE_EVENT,
		source,
	};
}

/**
 * Returns an action object used in signalling that the media modal current
 * view should be updated in the context of the post editor.
 *
 * @param  {ModalViews} view Media view
 * @return {Object}          Action object
 */
export function setEditorMediaModalView( view ) {
	const action = setMediaModalView( view );

	const stat = MODAL_VIEW_STATS[ view ];
	if ( stat ) {
		return withAnalytics( bumpStat( 'editor_media_actions', stat ), action );
	}

	return action;
}

/**
 * Returns an action object used in signalling that the confirmation sidebar
 * preference has changed.
 *
 * @param  {Number}  siteId    Site ID
 * @param  {?Bool}   isEnabled Whether or not the sidebar should be shown
 * @return {Object}            Action object
 */
export function saveConfirmationSidebarPreference( siteId, isEnabled = true ) {
	return ( dispatch, getState ) => {
		const disabledSites = getPreference( getState(), 'editorConfirmationDisabledSites' );

		if ( isEnabled ) {
			dispatch(
				savePreference(
					'editorConfirmationDisabledSites',
					filter( disabledSites, _siteId => siteId !== _siteId )
				)
			);
		} else {
			dispatch( savePreference( 'editorConfirmationDisabledSites', [ ...disabledSites, siteId ] ) );
		}

		dispatch(
			recordTracksEvent(
				isEnabled
					? 'calypso_publish_confirmation_preference_enable'
					: 'calypso_publish_confirmation_preference_disable'
			)
		);

		dispatch( bumpStat( 'calypso_publish_confirmation', isEnabled ? 'enabled' : 'disabled' ) );
	};
}

export const editorAutosaveReset = () => ( {
	type: EDITOR_AUTOSAVE_RESET,
} );

export const editorAutosaveSuccess = autosave => ( {
	type: EDITOR_AUTOSAVE_SUCCESS,
	autosave,
} );

export const editorAutosaveFailure = error => ( {
	type: EDITOR_AUTOSAVE_FAILURE,
	error,
} );

export const editorAutosave = post => ( dispatch, getState ) => {
	const site = getSelectedSite( getState() );

	if (
		! post.ID ||
		! site ||
		( site.jetpack && versionCompare( site.options.jetpack_version, '3.7.0-dev', '<' ) )
	) {
		return Promise.reject( new Error( 'NO_AUTOSAVE' ) );
	}

	dispatch( { type: EDITOR_AUTOSAVE } );

	const autosaveResult = wpcom
		.undocumented()
		.site( post.site_ID )
		.postAutosave( post.ID, {
			content: post.content,
			title: post.title,
			excerpt: post.excerpt,
		} );

	autosaveResult
		.then( autosave => dispatch( editorAutosaveSuccess( autosave ) ) )
		.catch( error => dispatch( editorAutosaveFailure( error ) ) );

	return autosaveResult;
};
